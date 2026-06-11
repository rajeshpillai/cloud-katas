#!/usr/bin/env bash
# Bring the Cloud Katas local lab environment up or down.
#
# Boots the floci (AWS) and floci-gcp (GCP) emulators plus a local image
# registry via docker-compose, and creates a single-node kind cluster for the
# Kubernetes-based labs. Together these let you run most lab commands locally
# for free, with no cloud account and no cost.
#
# Environment overrides:
#   KIND_CLUSTER   kind cluster name. Default "cloud-katas".
#   COMPOSE        docker compose command. Default "docker compose".
#
# Usage:
#   labs/lab.sh up        # start emulators + kind cluster
#   labs/lab.sh down      # tear everything down
#   labs/lab.sh status    # show emulator health and cluster nodes
#   labs/lab.sh env       # print the env exports (also: source labs/env.sh)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIND_CLUSTER="${KIND_CLUSTER:-cloud-katas}"
COMPOSE="${COMPOSE:-docker compose}"
REGISTRY_NAME="katas-registry"

# --- helpers ----------------------------------------------------------------

err() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
info() { printf '\033[36m%s\033[0m\n' "$*"; }
ok() { printf '\033[32m%s\033[0m\n' "$*"; }

require() {
  local tool="$1" hint="$2"
  if ! command -v "$tool" >/dev/null 2>&1; then
    err "Missing required tool: $tool"
    err "  Install: $hint"
    return 1
  fi
}

check_prereqs() {
  local missing=0
  require docker "https://docs.docker.com/get-docker/" || missing=1
  require kind "https://kind.sigs.k8s.io/docs/user/quick-start/#installation" || missing=1
  require kubectl "https://kubernetes.io/docs/tasks/tools/" || missing=1
  if ! docker info >/dev/null 2>&1; then
    err "Docker is installed but not running. Start Docker and retry."
    missing=1
  fi
  [ "$missing" -eq 0 ] || exit 1
}

# Poll an emulator's HTTP endpoint from the host until it answers (or give up).
wait_for_http() {
  local name="$1" url="$2" tries=30
  while [ "$tries" -gt 0 ]; do
    # Any HTTP response (even an error code) means the listener is up.
    if curl -s -o /dev/null --max-time 2 "$url"; then
      ok "  $name is up ($url)"
      return 0
    fi
    tries=$((tries - 1))
    sleep 1
  done
  err "  $name did not become ready at $url (continuing anyway)"
  return 0
}

# Connect the registry container to the kind network and advertise it to the
# cluster, following the kind local-registry convention.
wire_registry() {
  if [ -z "$(docker network ls --filter name=^kind$ -q 2>/dev/null)" ]; then
    return 0
  fi
  if ! docker network inspect kind 2>/dev/null | grep -q "\"$REGISTRY_NAME\""; then
    docker network connect kind "$REGISTRY_NAME" 2>/dev/null || true
  fi
  kubectl --context "kind-${KIND_CLUSTER}" apply -f - >/dev/null 2>&1 <<'EOF' || true
apiVersion: v1
kind: ConfigMap
metadata:
  name: local-registry-hosting
  namespace: kube-public
data:
  localRegistryHosting.v1: |
    host: "localhost:5001"
    help: "https://kind.sigs.k8s.io/docs/user/local-registry/"
EOF
}

# --- subcommands ------------------------------------------------------------

cmd_up() {
  check_prereqs
  info "Starting emulators (floci, floci-gcp, registry)..."
  (cd "$SCRIPT_DIR" && $COMPOSE up -d)

  wait_for_http "floci (AWS)" "http://localhost:4566/"
  wait_for_http "floci-gcp"   "http://localhost:4588/"
  wait_for_http "registry"    "http://localhost:5001/v2/"

  if kind get clusters 2>/dev/null | grep -qx "$KIND_CLUSTER"; then
    ok "kind cluster '$KIND_CLUSTER' already exists"
  else
    info "Creating kind cluster '$KIND_CLUSTER'..."
    kind create cluster --name "$KIND_CLUSTER" --config "$SCRIPT_DIR/kind-config.yaml"
  fi

  wire_registry

  echo
  ok "Lab environment ready."
  echo "Next:"
  echo "  source labs/env.sh        # point aws/gcloud at the emulators"
  echo "  labs/lab.sh status        # check health any time"
  echo "  kubectl config use-context kind-${KIND_CLUSTER}"
}

cmd_down() {
  info "Deleting kind cluster '$KIND_CLUSTER'..."
  kind delete cluster --name "$KIND_CLUSTER" 2>/dev/null || true
  info "Stopping emulators..."
  (cd "$SCRIPT_DIR" && $COMPOSE down)
  ok "Lab environment stopped."
}

cmd_status() {
  info "Emulators:"
  (cd "$SCRIPT_DIR" && $COMPOSE ps) || true
  echo
  info "Endpoint health:"
  for entry in "floci (AWS)=http://localhost:4566/" "floci-gcp=http://localhost:4588/" "registry=http://localhost:5001/v2/"; do
    name="${entry%%=*}"; url="${entry#*=}"
    if curl -s -o /dev/null --max-time 2 "$url"; then ok "  $name reachable"; else err "  $name unreachable ($url)"; fi
  done
  echo
  info "kind cluster '$KIND_CLUSTER':"
  if kind get clusters 2>/dev/null | grep -qx "$KIND_CLUSTER"; then
    kubectl --context "kind-${KIND_CLUSTER}" get nodes 2>/dev/null || err "  cluster exists but is not reachable"
  else
    err "  not created (run: labs/lab.sh up)"
  fi
}

cmd_env() {
  cat "$SCRIPT_DIR/env.sh"
}

case "${1:-}" in
  up) cmd_up ;;
  down) cmd_down ;;
  status) cmd_status ;;
  env) cmd_env ;;
  *)
    err "Usage: labs/lab.sh {up|down|status|env}"
    exit 1
    ;;
esac
