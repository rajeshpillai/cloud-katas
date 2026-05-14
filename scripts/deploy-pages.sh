#!/usr/bin/env bash
# Build the frontend and publish it to the gh-pages branch.
#
# Environment overrides:
#   BASE_PATH         URL path the site is served from. Default "/cloud-katas/".
#                     Must start and end with "/".
#   GH_PAGES_BRANCH   Target branch on origin. Default "gh-pages".
#   GH_PAGES_REMOTE   Remote name. Default "origin".
#
# Usage:
#   bash scripts/deploy-pages.sh
#   BASE_PATH=/ bash scripts/deploy-pages.sh        # publish at site root
#   GH_PAGES_BRANCH=docs bash scripts/deploy-pages.sh

set -euo pipefail

BASE_PATH="${BASE_PATH:-/cloud-katas/}"
BRANCH="${GH_PAGES_BRANCH:-gh-pages}"
REMOTE="${GH_PAGES_REMOTE:-origin}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

BUILD_DIR="frontend/dist"
WORKTREE_DIR=".gh-pages-worktree"

REMOTE_URL="$(git remote get-url "$REMOTE")"
COMMIT_SHA_SHORT="$(git rev-parse --short HEAD)"

echo "Deploying to $REMOTE_URL"
echo "  branch:    $BRANCH"
echo "  base path: $BASE_PATH"
echo "  source:    HEAD = $COMMIT_SHA_SHORT"
echo

if [[ "${BASE_PATH:0:1}" != "/" || "${BASE_PATH: -1}" != "/" ]]; then
  echo "BASE_PATH must start and end with '/' (got: '$BASE_PATH')" >&2
  exit 1
fi

# Build the frontend with the right base URL.
(
  cd frontend
  VITE_BASE="$BASE_PATH" npm run build
)

if [[ ! -d "$BUILD_DIR" ]]; then
  echo "Build did not produce $BUILD_DIR" >&2
  exit 1
fi

# Clean any stale worktree from a previous run.
git worktree remove --force "$WORKTREE_DIR" >/dev/null 2>&1 || true
rm -rf "$WORKTREE_DIR"

# Attach the worktree to the gh-pages branch, creating it if necessary.
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git worktree add "$WORKTREE_DIR" "$BRANCH"
elif git ls-remote --exit-code --heads "$REMOTE" "$BRANCH" >/dev/null 2>&1; then
  git fetch "$REMOTE" "$BRANCH:$BRANCH"
  git worktree add "$WORKTREE_DIR" "$BRANCH"
else
  echo "Creating orphan branch $BRANCH (first deploy)"
  git worktree add --detach "$WORKTREE_DIR" HEAD
  (
    cd "$WORKTREE_DIR"
    git checkout --orphan "$BRANCH"
    git rm -rf . >/dev/null 2>&1 || true
  )
fi

# Replace the worktree contents with the fresh build output.
find "$WORKTREE_DIR" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
cp -R "$BUILD_DIR"/. "$WORKTREE_DIR"/
touch "$WORKTREE_DIR/.nojekyll"

# Commit and push.
(
  cd "$WORKTREE_DIR"
  git add -A
  if git diff --cached --quiet; then
    echo "No changes to publish."
  else
    git commit -m "Deploy $(date -u +%Y-%m-%dT%H:%M:%SZ) from $COMMIT_SHA_SHORT"
    git push "$REMOTE" "$BRANCH"
  fi
)

git worktree remove --force "$WORKTREE_DIR"
echo
echo "Done. GitHub Pages usually serves the new build within 1-2 minutes."
echo "Site URL: see Settings > Pages on the repository."
