# Primer: CLI & Data Formats

> The labs lean on a handful of shell and file-format idioms without stopping to explain them. This is a quick reference so a paste like `-o jsonpath='{.status.podIP}'` or `base64 -d` doesn't stall you. Skim it, then come back as needed.

## Shell basics the labs assume

- **Environment variables**: `export VPC_ID=vpc-123` sets a variable; `"$VPC_ID"` uses it. Always quote (`"$VAR"`) so spaces/empties don't break the command. Variables you `export` are visible to programs you run; they vanish when you close the shell.
- **Command substitution**: `$(...)` runs a command and pastes its output. `VPC_ID=$(aws ec2 create-vpc --query Vpc.VpcId --output text)` captures the new VPC's id into a variable.
- **Pipes and redirection**: `a | b` feeds a's output into b. `> file` writes to a file, `2>/dev/null` throws away errors, `-o /dev/null` discards output (used when you only care about the exit code / status).
- **`|| true`**: run a command but don't let a non-zero exit stop the script — handy for "this may or may not exist" checks.
- **Backgrounding**: `cmd &` runs in the background, `$!` is its PID, `kill $!` stops it. Used for `kubectl port-forward` and local servers.
- **Heredocs**: 
  ```bash
  kubectl apply -f - <<'EOF'
  apiVersion: v1
  kind: ConfigMap
  ...
  EOF
  ```
  Everything between `<<EOF` and `EOF` is fed to the command as if it were a file. With `<<'EOF'` (quoted) the text is literal; with `<<EOF` (unquoted) shell `$variables` inside are expanded first.

## JSON and YAML

Both describe the same shape of data (objects/keys, lists, strings, numbers); they're just two spellings.

- **JSON** — braces and quotes, used by AWS CLI output and IAM policy documents:
  ```json
  { "Version": "2012-10-17", "Statement": [ { "Effect": "Allow", "Action": "s3:GetObject" } ] }
  ```
- **YAML** — indentation instead of braces, used by Kubernetes manifests and CI configs. **Indentation is significant** (spaces, never tabs). The same data:
  ```yaml
  version: "2012-10-17"
  statement:
    - effect: Allow
      action: s3:GetObject
  ```
  A leading `-` starts a list item. A trailing `:` starts a nested block.

**YAML anchors** (seen in GitLab CI): `&name` defines a reusable block and `*name` pastes it, so shared setup isn't repeated:
```yaml
.auth: &auth
  - gcloud auth login --cred-file=creds.json
build:
  before_script: *auth
```

## Querying output: `--query`, jsonpath, `jq`, `yq`

The labs pull one value out of a big blob three different ways:

- **AWS `--query` (JMESPath)**: `aws ec2 describe-vpcs --query 'Vpcs[0].VpcId' --output text` — `Vpcs[0]` = first item, `.VpcId` = that field. `[]` iterates a list.
- **kubectl `-o jsonpath`**: `kubectl get pod web -o jsonpath='{.status.podIP}'` — dotted path into the object. `{.items[0].metadata.name}` walks a list. Dots inside a key must be escaped: `{.metadata.labels.app\.kubernetes\.io/name}`.
- **`jq`** (JSON) / **`yq`** (YAML) — standalone filters: `cat out.json | jq '.Account'`, `kubectl get pod web -o yaml | yq '.status.phase'`. If a lab uses `yq` and you don't have it, the same value is usually reachable with `-o jsonpath`.

## Encoding: base64 (not encryption!)

**base64** turns bytes into plain ASCII so binary data survives inside text (YAML, JSON, HTTP headers). Kubernetes Secrets store values base64-encoded:

```bash
echo -n 'hunter2' | base64        # cGFzcw==   (encode)
echo 'aHVudGVyMg==' | base64 -d   # hunter2    (decode)
```

**base64 is encoding, not encryption** — anyone can decode it. It hides nothing; it only makes bytes text-safe. Real secrecy comes from encryption (KMS) and access control (IAM/RBAC).

## File arguments: `file://` and `fileb://`

Some CLIs read an argument from a file instead of inline text. `file://policy.json` = read this text file; `fileb://blob.bin` = read this **binary** file (used for KMS ciphertext). A single `-` usually means "read from stdin", e.g. `gcloud secrets versions add x --data-file=-`.

## Go deeper

- [JMESPath (AWS `--query`)](https://jmespath.org/tutorial.html)
- [kubectl jsonpath](https://kubernetes.io/docs/reference/kubectl/jsonpath/)
- [jq manual](https://jqlang.github.io/jq/manual/)
- [YAML in one page](https://learnxinyminutes.com/docs/yaml/)
