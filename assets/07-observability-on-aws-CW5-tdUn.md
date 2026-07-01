# Observability on AWS

## Overview

This lesson exercises AWS's observability stack against the sample app running on EKS. You will enable Container Insights for the cluster, query the structured logs the sample app emits with CloudWatch Logs Insights, instrument the sample app for one trace span with AWS Distro for OpenTelemetry (ADOT), and attach a metric alarm.

The mental model is the same as the GCP observability lesson: metrics show what changed, logs explain what happened, traces show where time was spent. The AWS-native components are CloudWatch (logs and metrics), X-Ray (traces), ADOT (the OTel collector), and optionally AMP + AMG (managed Prometheus and Grafana).

## Estimated Time

- 90 minutes

## Prerequisites

- Completed [Amazon EKS](02-amazon-eks-elastic-kubernetes-service.md)
- The sample app running on the EKS cluster with the NLB reachable
- The `cloud-katas` AWS profile authenticated

> **Background you need (brush-up):** New to any of these? Skim the linked primer — the lab won't stop to explain them.
>
> - [CLI & data formats](../primers/cli-and-data-formats.md) — the OTel collector's YAML, `-o jsonpath`, and the log-query/regex syntax in Logs Insights.
> - [Identity & IAM](../primers/identity-and-iam.md) — IRSA, which grants the collector its permissions.

## Cost Notice

CloudWatch Logs charges per GB ingested and stored. CloudWatch Container Insights adds ingestion cost based on cluster size; for this lab it is small. X-Ray free tier covers the first 100k traces/month.

## Learning Objectives

- Enable Container Insights on the EKS cluster
- Query JSON-structured pod logs with CloudWatch Logs Insights
- Create a CloudWatch metric alarm on a workload signal
- Run the ADOT collector to send a trace span to X-Ray
- Recognize where Managed Prometheus + Managed Grafana fit

## Core Concepts

- CloudWatch Logs: Stream-and-group model. EKS Container Insights writes container logs to `/aws/containerinsights/CLUSTER_NAME/application`. Each container is a log stream.
- Container Insights: An add-on that emits cluster-, node-, pod-, and container-level metrics on a fixed cadence, plus structured logs from Fluent Bit. It is what makes `aws cloudwatch get-metric-statistics` useful for EKS.
- Logs Insights queries: A SQL-like query language for CloudWatch Logs. Indexed JSON fields can be referenced as `@logStream`, `kubernetes.pod_name`, `path`, etc.
- Alarms: Threshold + evaluation periods → state (`OK`, `INSUFFICIENT_DATA`, `ALARM`). For dynamic workloads, prefer composite alarms or multi-window strategies — single thresholds page on every spike.
- X-Ray traces: Sampled (1-5% typically) traces of requests across services. Spans include service name, operation, duration, errors, and annotations.
- ADOT: AWS Distro for OpenTelemetry. A vendor-neutral collector that can run as a sidecar, daemonset, or central collector and forward to X-Ray, AMP, CloudWatch, and other backends.

## Lab

> ### Run locally with floci
>
> **Partly local.** Workloads run in [kind](https://kind.sigs.k8s.io/) while CloudWatch Logs/Metrics and alarms run against the [floci](https://github.com/floci-io/floci) AWS emulator.
>
> ```bash
> ./labs/lab.sh up        # floci + "cloud-katas" kind cluster
> source labs/env.sh
> kubectl config use-context kind-cloud-katas
> ```
>
> Drive traffic against the sample app in kind, then create log groups, run metric queries, and set a metric alarm against floci's CloudWatch APIs.
>
> **Not emulated locally:** X-Ray, Container Insights, Managed Prometheus (AMP), and Managed Grafana (AMG) are simulate-only.

### 1. Prepare

```bash
export AWS_PROFILE=cloud-katas
export AWS_REGION="us-east-1"
export CLUSTER_NAME="learning-eks"
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws eks describe-cluster --name "$CLUSTER_NAME" --query 'cluster.status'
kubectl config use-context "$(kubectl config get-contexts -o name | grep "$CLUSTER_NAME" | head -1)"
kubectl -n sample get deployment sample
```

### 2. Enable Container Insights

Install the CloudWatch Observability addon (the modern, single-step approach):

```bash
aws eks create-addon \
  --cluster-name "$CLUSTER_NAME" \
  --addon-name amazon-cloudwatch-observability \
  --resolve-conflicts OVERWRITE 2>&1 | head -5

aws eks describe-addon \
  --cluster-name "$CLUSTER_NAME" \
  --addon-name amazon-cloudwatch-observability \
  --query 'addon.{Status:status,Version:addonVersion}'
```

If the addon does not exist for your EKS version, fall back to the manual Fluent Bit + CloudWatch agent quickstart documented in [the Container Insights guide](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Container-Insights-setup-EKS-quickstart.html).

Wait a few minutes for log groups to appear.

```bash
aws logs describe-log-groups --log-group-name-prefix "/aws/containerinsights/$CLUSTER_NAME" \
  --query 'logGroups[].logGroupName'
```

### 3. Drive Traffic

```bash
EXTERNAL_HOST=$(kubectl -n sample get svc sample -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

# 30 seconds of mixed traffic
END=$(( $(date +%s) + 30 ))
while [ "$(date +%s)" -lt "$END" ]; do
  curl -s -o /dev/null "http://$EXTERNAL_HOST/healthz"
  curl -s -o /dev/null "http://$EXTERNAL_HOST/" || true
  sleep 0.3
done
```

### 4. Logs Insights Query

Open the CloudWatch Logs Insights console, pick the `/aws/containerinsights/$CLUSTER_NAME/application` log group, and run:

```text
fields @timestamp, kubernetes.pod_name, log
| filter kubernetes.namespace_name = "sample"
| sort @timestamp desc
| limit 20
```

To extract paths from the JSON log lines the sample app emits:

```text
fields @timestamp, log
| parse log /"path":"(?<path>[^"]+)"/
| filter kubernetes.namespace_name = "sample"
| stats count() as requests by path
| sort requests desc
```

Save this query as "sample app — request paths".

CLI equivalent (one-shot):

```bash
aws logs start-query \
  --log-group-name "/aws/containerinsights/$CLUSTER_NAME/application" \
  --start-time $(( $(date +%s) - 600 )) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, log | filter kubernetes.namespace_name = "sample" | limit 20'
```

### 5. Create a Metric Alarm

Pick a Container Insights metric — for example pod CPU utilization for the `sample` deployment.

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "sample-pod-cpu-high" \
  --metric-name pod_cpu_utilization \
  --namespace ContainerInsights \
  --dimensions Name=ClusterName,Value="$CLUSTER_NAME" Name=Namespace,Value=sample \
  --statistic Average \
  --period 60 \
  --evaluation-periods 3 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-description "Sample pod CPU > 80% for 3 minutes"

aws cloudwatch describe-alarms --alarm-names "sample-pod-cpu-high" \
  --query 'MetricAlarms[0].{State:StateValue,Reason:StateReason}'
```

To exercise the alarm, you can spike load via the GKE-style `kubectl run loadgen` recipe from lesson 03.

### 6. Instrument the Sample App for X-Ray With ADOT

Two phases: deploy the ADOT collector, then make the app send spans to it.

Install ADOT in the cluster:

```bash
kubectl apply -f https://github.com/open-telemetry/opentelemetry-operator/releases/latest/download/opentelemetry-operator.yaml

kubectl wait -n opentelemetry-operator-system --for=condition=Available deployment/opentelemetry-operator-controller-manager --timeout=120s
```

Create an ADOT collector instance that forwards to X-Ray:

```yaml
# v1beta1 is the current CRD version; note `config` is a structured map here,
# not the string (`config: |`) the older v1alpha1 used. Empty blocks need `{}`.
apiVersion: opentelemetry.io/v1beta1
kind: OpenTelemetryCollector
metadata:
  name: adot
  namespace: sample
spec:
  mode: deployment
  config:
    receivers:
      otlp:
        protocols:
          grpc: {}
          http: {}
    processors:
      batch: {}
    exporters:
      awsxray:
        region: us-east-1
    service:
      pipelines:
        traces:
          receivers: [otlp]
          processors: [batch]
          exporters: [awsxray]
```

```bash
kubectl apply -f adot-collector.yaml -n sample
kubectl -n sample get pods -l app.kubernetes.io/name=adot-collector
```

The collector needs IAM permission to write to X-Ray. The simplest path is to add `arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess` to the node role; for production, use IRSA on the collector's service account.

The sample app does not yet emit spans. For a quick test, run a one-off pod that does:

```bash
kubectl run trace-test --rm -i --restart=Never --image=python:3.13-alpine -- \
  sh -c 'pip install -q opentelemetry-sdk opentelemetry-exporter-otlp opentelemetry-api && \
         python -c "
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
provider = TracerProvider(resource=Resource.create({\"service.name\": \"trace-test\"}))
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=\"adot-collector:4317\", insecure=True)))
trace.set_tracer_provider(provider)
tracer = trace.get_tracer(__name__)
with tracer.start_as_current_span(\"hello\") as span:
    span.set_attribute(\"who\", \"learner\")
provider.shutdown()
print(\"sent\")
"'
```

In the X-Ray console, wait ~30 seconds, then look for the `trace-test` service map.

### 7. Managed Prometheus and Grafana (Concept)

For Prometheus-native workflows on AWS:

- AMP (Amazon Managed Service for Prometheus): scrapes metrics from your workloads (or via the AWS Managed Collector for EKS) and stores them.
- AMG (Amazon Managed Grafana): dashboards on top of AMP, CloudWatch, X-Ray, and other sources.

You would use AMP+AMG instead of (or alongside) CloudWatch metrics when teams already speak PromQL and have existing dashboards.

## Validate

```bash
aws eks describe-addon --cluster-name "$CLUSTER_NAME" \
  --addon-name amazon-cloudwatch-observability \
  --query 'addon.status'

aws logs describe-log-groups --log-group-name-prefix "/aws/containerinsights/$CLUSTER_NAME" \
  --query 'logGroups[].logGroupName'

aws cloudwatch describe-alarms --alarm-names "sample-pod-cpu-high" \
  --query 'MetricAlarms[0].{State:StateValue,Reason:StateReason}'

aws xray get-service-graph --start-time $(( $(date +%s) - 900 )) --end-time $(date +%s) \
  --query 'Services[].Name'
```

Success means:

- Container Insights is active and writing logs.
- A Logs Insights query returns recent JSON entries from the sample namespace.
- A metric alarm exists with a defined threshold and is in `OK` or `INSUFFICIENT_DATA`.
- X-Ray shows the `trace-test` service after the one-off span.

## Troubleshooting

- No logs in `/aws/containerinsights/CLUSTER/application`: The addon needs an IAM policy on the node role. The `AmazonEKS_Observability_Policy` or similar managed policy must be attached.
- Logs Insights returns zero rows: The time window is too narrow. Default to last 15 minutes for debugging.
- Alarm stuck `INSUFFICIENT_DATA`: Metric not flowing. Confirm Container Insights is reporting metrics in the `ContainerInsights` namespace; sometimes it is `AWS/EKS`.
- X-Ray empty: Check the ADOT collector logs for export errors (likely an IAM denial). Set the SDK to log debug spans to confirm the app actually sent.
- ADOT collector pod `CrashLoopBackOff`: YAML config error or missing IAM. `kubectl -n sample logs deployment/adot-collector` is the first stop.

## Cleanup

```bash
aws cloudwatch delete-alarms --alarm-names "sample-pod-cpu-high"
kubectl delete -f adot-collector.yaml -n sample --ignore-not-found
kubectl delete -f https://github.com/open-telemetry/opentelemetry-operator/releases/latest/download/opentelemetry-operator.yaml --ignore-not-found
aws eks delete-addon --cluster-name "$CLUSTER_NAME" --addon-name amazon-cloudwatch-observability
```

The Container Insights log groups stay around to preserve history; delete manually if you do not want them.

## Cross-Cloud Callout

- AWS CloudWatch ↔ GCP Cloud Monitoring + Cloud Logging: AWS bundles metrics and logs under one product name; GCP splits them.
- AWS Container Insights ↔ GKE built-in observability: GKE emits container metrics and logs by default; EKS needs the addon.
- AWS X-Ray ↔ GCP Cloud Trace: same OpenTelemetry-friendly tracing primitive.
- AWS ADOT ↔ GCP Cloud Operations Agent + Otel collector: both forward OTel spans to the cloud-native trace store.
- AWS AMP + AMG ↔ GCP Managed Prometheus + Cloud Monitoring: nearly identical positioning.

## Checkpoint

- Identify the log group naming convention Container Insights uses.
- Explain the difference between a metric alarm in `OK` and one in `INSUFFICIENT_DATA`.
- Describe what the ADOT collector adds that the X-Ray SDK alone does not.
- Identify when AMP+AMG is the better fit than CloudWatch metrics.

## Further Reading

- [Container Insights for EKS](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/ContainerInsights.html)
- [CloudWatch Logs Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AnalyzingLogData.html)
- [AWS X-Ray](https://docs.aws.amazon.com/xray/latest/devguide/aws-xray.html)
- [AWS Distro for OpenTelemetry](https://aws-otel.github.io/docs/introduction)
- [Amazon Managed Service for Prometheus](https://docs.aws.amazon.com/prometheus/latest/userguide/what-is-Amazon-Managed-Service-Prometheus.html)
- [Amazon Managed Grafana](https://docs.aws.amazon.com/grafana/latest/userguide/what-is-Amazon-Managed-Service-Grafana.html)
