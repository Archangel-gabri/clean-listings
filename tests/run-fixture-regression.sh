#!/usr/bin/env bash
set -euo pipefail

test_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
playwright_package=$(find "$HOME/.npm/_npx" -path '*/node_modules/playwright/package.json' -print -quit 2>/dev/null)

if [[ -z "$playwright_package" ]]; then
  echo 'playwright package not found; start the workspace Playwright MCP first' >&2
  exit 2
fi

playwright_node_modules=$(dirname -- "$(dirname -- "$playwright_package")")
for fixture in fixture-regression.html content-regression.html performance-regression.html store-regression.html popup-regression.html; do
  NODE_PATH="$playwright_node_modules${NODE_PATH:+:$NODE_PATH}" \
    node "$test_dir/run-fixture-regression.cjs" "$fixture"
done
