#!/usr/bin/env bash
# Start the Cloud Katas frontend in development mode (Vite dev server).
#
# Installs dependencies on first run, then launches the hot-reloading dev
# server bound to 0.0.0.0 so it is reachable from other devices on the LAN.
#
# Usage:
#   ./dev.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

cd "$FRONTEND_DIR"

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting Vite dev server..."
exec npm run dev
