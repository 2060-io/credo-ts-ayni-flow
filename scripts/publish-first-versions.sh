#!/usr/bin/env bash
# One-time bootstrap: publishes every package of this workspace to npm from your own login, so that
# trusted publishing (which needs an existing package) can then be configured on npmjs.com.
# Run from the repository root after `pnpm install`: scripts/publish-first-versions.sh
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm build
for dir in packages/*/; do
  name=$(jq -r .name "$dir/package.json")
  private=$(jq -r '.private // false' "$dir/package.json")
  version=$(jq -r .version "$dir/package.json")
  if [ "$private" = "true" ]; then continue; fi
  if npm view "$name@$version" version >/dev/null 2>&1; then
    echo "skip $name@$version (already on npm)"
    continue
  fi
  echo "publishing $name@$version"
  pnpm publish "./$dir" --access public --no-git-checks
done
