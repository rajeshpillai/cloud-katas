# Point the cloud CLIs and SDKs at the local floci emulators.
#
# Usage:
#   source labs/env.sh
#
# These variables are read by the official `aws` CLI / AWS SDKs and the Google
# Cloud SDKs. The credentials are deliberately fake — floci accepts any
# non-empty value and performs no authentication. Sourcing this file affects
# only the current shell; open a new terminal (or `unset` them) to talk to a
# real cloud account again.

# ----- AWS (floci, port 4566) -----------------------------------------------
export AWS_ENDPOINT_URL="http://localhost:4566"
export AWS_DEFAULT_REGION="us-east-1"
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="test"
export AWS_SECRET_ACCESS_KEY="test"

# ----- GCP (floci-gcp, port 4588) -------------------------------------------
# Single endpoint multiplexes every emulated service over HTTP/2.
export STORAGE_EMULATOR_HOST="http://localhost:4588"
export PUBSUB_EMULATOR_HOST="localhost:4588"
export FIRESTORE_EMULATOR_HOST="localhost:4588"
export DATASTORE_EMULATOR_HOST="localhost:4588"
export SECRET_MANAGER_EMULATOR_HOST="localhost:4588"
export GOOGLE_CLOUD_PROJECT="floci-local"
export CLOUDSDK_CORE_PROJECT="floci-local"

# ----- Local image registry (for the kind labs) ----------------------------
export KATAS_REGISTRY="localhost:5001"

echo "floci env loaded: AWS -> ${AWS_ENDPOINT_URL}, GCP -> ${STORAGE_EMULATOR_HOST}, registry -> ${KATAS_REGISTRY}"
