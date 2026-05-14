# Amazon EKS

## Overview

This lesson creates a managed EKS cluster with `eksctl`, deploys the sample app, configures IAM Roles for Service Accounts (IRSA) so the pod can call AWS APIs without static keys, inspects the cluster addons (VPC CNI, CoreDNS, kube-proxy), and contrasts node autoscaling options.

The cross-cloud focus is IRSA — AWS's equivalent of GKE Workload Identity. If you understood lesson 03 of the GCP sequence, this should feel familiar: a Kubernetes service account is trusted by IAM and exchanges its projected token for AWS credentials at runtime.

## Estimated Time

- 120-150 minutes

## Prerequisites

- Completed [Docker and Kubernetes Basics](../gcp/02-docker-and-kubernetes-basics.md) and [AWS Fundamentals](01-aws-fundamentals.md)
- `aws`, `kubectl`, `eksctl`, and `helm` installed
- The `cloud-katas` AWS profile configured and authenticated
- About 30 minutes of patience for the cluster to come up

## Cost Notice

EKS bills $0.10/hour for the cluster control plane plus the cost of any nodes or Fargate pods. A two-node `t3.small` cluster running this lab costs a small handful of US dollars per day. Tear it down at the end.

## Learning Objectives

- Create an EKS cluster with `eksctl` (managed node group)
- Push the sample app to Amazon ECR and deploy it
- Expose a workload with an AWS Load Balancer Controller-managed Service or ALB
- Wire IRSA: OIDC provider + IAM role + trust policy + KSA annotation + token exchange validation
- Identify the three managed addons (VPC CNI, CoreDNS, kube-proxy) and what each owns
- Recognize when to use Karpenter versus Cluster Autoscaler

## Core Concepts

- EKS control plane: AWS runs the API server, scheduler, etcd, and controller manager across multiple AZs. You see only the endpoint and credentials.
- Managed node groups vs Fargate: Managed node groups run EC2 instances in your account that EKS keeps patched and rotates on upgrades. Fargate runs pods without nodes; you pay per pod resource request. Use managed node groups for general workloads, Fargate for spiky or short-lived jobs.
- Cluster autoscaling: Karpenter is the AWS-recommended autoscaler — it provisions right-sized instances in seconds based on actual pod requirements. Cluster Autoscaler is older and works at the node-group level. Both are optional add-ons.
- IRSA: An OIDC identity provider per cluster lets IAM trust pods that present a projected service account token. The IAM role's trust policy names the cluster's OIDC issuer plus the exact `system:serviceaccount:NAMESPACE:KSA` subject. No long-lived keys, no key rotation.
- Cluster addons: VPC CNI assigns ENIs and pod IPs from your VPC. CoreDNS handles DNS. kube-proxy programs iptables. EKS treats these as managed addons; upgrade them along with the cluster.
- Pod identity (newer alternative): EKS Pod Identity is a 2023 simplification that avoids the OIDC provider step. IRSA is still standard and widely deployed; recognize both names.

## Lab

### 1. Prepare

```bash
export AWS_PROFILE=cloud-katas
export AWS_REGION="us-east-1"
export CLUSTER_NAME="learning-eks"
aws sts get-caller-identity
eksctl version
```

Confirm the required IAM permissions. `eksctl` needs broad permissions: EC2, IAM, CloudFormation, EKS. A user with the AWS-managed `AdministratorAccess` policy is acceptable in a sandbox; in production you would scope this tightly.

### 2. Create the Cluster

```bash
eksctl create cluster \
  --name "$CLUSTER_NAME" \
  --region "$AWS_REGION" \
  --version "1.30" \
  --node-type t3.small \
  --nodes 2 \
  --nodes-min 1 \
  --nodes-max 4 \
  --managed \
  --with-oidc
```

`--with-oidc` is the critical flag — it creates the OIDC identity provider IRSA depends on. The command takes ~15-20 minutes. Read sections 3 and 4 while you wait.

When it returns:

```bash
aws eks describe-cluster --name "$CLUSTER_NAME" --query 'cluster.{Status:status,OIDC:identity.oidc.issuer}'
kubectl get nodes
kubectl get pods --all-namespaces
```

### 3. Push the Sample App to ECR

Create a private repository and authenticate Docker against it.

```bash
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_REPO="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/cloud-katas-sample"

aws ecr create-repository --repository-name cloud-katas-sample --region "$AWS_REGION" || true

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

cd ../sample-app
docker build -f containerfile -t "$ECR_REPO:v1" .
docker push "$ECR_REPO:v1"
cd -
```

### 4. Deploy the Workload

Create a namespace and a Kubernetes service account (the future IRSA subject).

```bash
kubectl create namespace sample
kubectl config set-context --current --namespace=sample
kubectl create serviceaccount sample
```

Create `eks/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sample
  labels: { app: sample }
spec:
  replicas: 2
  selector:
    matchLabels: { app: sample }
  template:
    metadata:
      labels: { app: sample }
    spec:
      serviceAccountName: sample
      containers:
        - name: sample
          image: REPLACE_WITH_IMAGE
          ports:
            - containerPort: 8080
          readinessProbe:
            httpGet: { path: /readyz, port: 8080 }
          livenessProbe:
            httpGet: { path: /healthz, port: 8080 }
          resources:
            requests: { cpu: "100m", memory: "128Mi" }
            limits: { cpu: "500m", memory: "256Mi" }
```

Create `eks/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: sample
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: "external"
    service.beta.kubernetes.io/aws-load-balancer-nlb-target-type: "ip"
    service.beta.kubernetes.io/aws-load-balancer-scheme: "internet-facing"
spec:
  type: LoadBalancer
  selector: { app: sample }
  ports:
    - port: 80
      targetPort: 8080
```

Apply.

```bash
sed -i.bak "s|REPLACE_WITH_IMAGE|$ECR_REPO:v1|" eks/deployment.yaml
kubectl apply -f eks/
kubectl rollout status deployment/sample
```

Get the external hostname (NLBs use DNS names, not IPs).

```bash
EXTERNAL_HOST=$(kubectl get svc sample -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "$EXTERNAL_HOST"
sleep 60
curl -s "http://$EXTERNAL_HOST/" | head
curl -s "http://$EXTERNAL_HOST/healthz"
```

### 5. Wire IRSA

The OIDC provider already exists (created by `--with-oidc`). Build a trust policy that names it plus our exact KSA.

```bash
export OIDC_ISSUER=$(aws eks describe-cluster --name "$CLUSTER_NAME" \
  --query 'cluster.identity.oidc.issuer' --output text | sed 's|https://||')

cat > trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::$ACCOUNT_ID:oidc-provider/$OIDC_ISSUER" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "$OIDC_ISSUER:sub": "system:serviceaccount:sample:sample",
        "$OIDC_ISSUER:aud": "sts.amazonaws.com"
      }
    }
  }]
}
EOF

aws iam create-role \
  --role-name sample-irsa \
  --assume-role-policy-document file://trust.json

aws iam attach-role-policy \
  --role-name sample-irsa \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess

kubectl annotate serviceaccount sample \
  eks.amazonaws.com/role-arn="arn:aws:iam::$ACCOUNT_ID:role/sample-irsa" \
  --overwrite

kubectl rollout restart deployment/sample
kubectl rollout status deployment/sample
```

Validate the token exchange from inside a pod.

```bash
POD=$(kubectl get pod -l app=sample -o jsonpath='{.items[0].metadata.name}')

kubectl exec "$POD" -- sh -c '
  apk add --no-cache aws-cli >/dev/null 2>&1 || true
  echo "Token file: $AWS_WEB_IDENTITY_TOKEN_FILE"
  echo "Role ARN:   $AWS_ROLE_ARN"
  aws sts get-caller-identity 2>&1 | head -10 || \
    echo "aws CLI not available in image; show env shows the projection worked"
'
```

The output shows `AWS_WEB_IDENTITY_TOKEN_FILE` pointing at a projected token and `AWS_ROLE_ARN` matching the role. That is IRSA at work.

### 6. Inspect Managed Addons

```bash
aws eks list-addons --cluster-name "$CLUSTER_NAME"
aws eks describe-addon --cluster-name "$CLUSTER_NAME" --addon-name vpc-cni
aws eks describe-addon --cluster-name "$CLUSTER_NAME" --addon-name coredns
aws eks describe-addon --cluster-name "$CLUSTER_NAME" --addon-name kube-proxy
```

To upgrade an addon to a newer compatible version:

```bash
aws eks describe-addon-versions --addon-name vpc-cni \
  --kubernetes-version 1.30 --query 'addons[0].addonVersions[0:3].addonVersion'
# aws eks update-addon --cluster-name "$CLUSTER_NAME" --addon-name vpc-cni --addon-version vX.Y.Z-eksbuild.N
```

### 7. Autoscaling Sidebar

Cluster Autoscaler vs Karpenter:

- Cluster Autoscaler: scales an existing managed node group up or down. Slow (minutes) and tied to one instance type.
- Karpenter: provisions just-in-time nodes of the right size for pending pods. Often seconds, often cheaper. Install via Helm in a later lab; recognize the name now.

EKS Pod Identity (newer than IRSA) skips the OIDC provider step and uses an EKS-managed agent. Both exist; IRSA is what most production workloads still run.

## Validate

```bash
kubectl get deployment sample -o jsonpath='{.status.availableReplicas}{"\n"}'
kubectl get svc sample -o jsonpath='{.status.loadBalancer.ingress[0].hostname}{"\n"}'
kubectl get sa sample -o jsonpath='{.metadata.annotations.eks\.amazonaws\.com/role-arn}{"\n"}'
aws eks list-addons --cluster-name "$CLUSTER_NAME"
```

Success means:

- Deployment is fully available.
- The NLB hostname resolves and serves JSON over HTTP.
- The Kubernetes service account is annotated with the IRSA role ARN.
- VPC CNI, CoreDNS, and kube-proxy are listed as addons.

## Troubleshooting

- `Unauthorized` from kubectl: Update kubeconfig with `aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION"`. Confirm `aws sts get-caller-identity` matches the principal listed in the cluster's `aws-auth` ConfigMap.
- NLB `EXTERNAL-IP` stays empty: Check the AWS Load Balancer Controller pods (if installed) or fall back to the in-tree NLB by removing the annotations. NLB takes 2-3 minutes to become healthy.
- IRSA does not work: Verify the trust policy uses `$OIDC_ISSUER` exactly (no `https://` prefix). The `sub` must match `system:serviceaccount:NAMESPACE:KSA` exactly.
- `ImagePullBackOff` from ECR: The node IAM role needs `AmazonEC2ContainerRegistryReadOnly`. `eksctl create cluster` attaches it by default; if you customized the node group, re-attach.
- Cluster create fails with `InsufficientCapacity`: The instance type is unavailable in the AZ. Add `--zones us-east-1a,us-east-1b,us-east-1c` or pick a different region.

## Cleanup

```bash
kubectl delete -f eks/ --ignore-not-found
kubectl delete sa sample --ignore-not-found
kubectl delete namespace sample --ignore-not-found

aws iam detach-role-policy --role-name sample-irsa --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess
aws iam delete-role --role-name sample-irsa

aws ecr delete-repository --repository-name cloud-katas-sample --force

eksctl delete cluster --name "$CLUSTER_NAME" --region "$AWS_REGION"
```

Confirm the cluster is gone:

```bash
aws eks list-clusters --query 'clusters' --output text | grep -v "$CLUSTER_NAME"
```

## Cross-Cloud Callout

- EKS managed control plane ↔ GKE managed control plane: similar pricing model; GKE Autopilot has no equivalent in EKS, though Fargate is close for serverless pods.
- IRSA ↔ GKE Workload Identity: same idea, different mechanism. IRSA uses an IAM trust policy referencing the cluster's OIDC issuer; GKE binds a Kubernetes SA to a Google SA via a project-scoped Workload Identity Pool.
- ECR ↔ Artifact Registry: both are managed container registries with IAM-gated access. ECR is region-scoped per repository; Artifact Registry is region-scoped per repository.
- Managed addons (VPC CNI, CoreDNS, kube-proxy) ↔ GKE Dataplane V2: GKE bakes networking, DNS, and proxying into the cluster — you do not manage them as separate addons.

## Checkpoint

- Recite the four elements that make IRSA work (OIDC provider, IAM role, trust policy, KSA annotation).
- Explain why IRSA's trust policy must reference both the OIDC issuer and the exact `sub`.
- Identify the difference between an NLB and an ALB and pick the right one for an HTTPS API.
- Describe one situation where Fargate is preferable to a managed node group.

## Further Reading

- [Amazon EKS user guide](https://docs.aws.amazon.com/eks/latest/userguide/what-is-eks.html)
- [IAM roles for service accounts (IRSA)](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html)
- [EKS Pod Identity (newer alternative)](https://docs.aws.amazon.com/eks/latest/userguide/pod-identities.html)
- [EKS managed addons](https://docs.aws.amazon.com/eks/latest/userguide/eks-add-ons.html)
- [Karpenter](https://karpenter.sh/)
