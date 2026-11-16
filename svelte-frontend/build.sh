#!/usr/bin/env bash
# Build the Svelte frontend and install it into the server's ./static folder
# (the Go server serves that folder at /static/). Svelte equivalent of the Angular build.sh.
#
# Usage: ./build.sh [target-dir]     (default: ../static)
#
# Kept in the target, never overwritten or deleted:
#   - app-config.json  (per-installation server settings; created once if missing)
#   - assets/          (server.go uses assets/vinyl.webp as the cover fallback;
#                       the Svelte bundle goes to app/ so it never collides)
set -euo pipefail

cd "$(dirname "$0")"
TARGET="${1:-../static}"

[ -d node_modules ] || npm ci
npm run build

mkdir -p "$TARGET"
rsync -avz --delete \
  --exclude app-config.json \
  --exclude /assets/ \
  dist/ "$TARGET/"

# Same-origin API by default: the server that serves the UI also serves the API.
if [ ! -f "$TARGET/app-config.json" ]; then
  printf '{\n  "servicesBasePath": ""\n}\n' > "$TARGET/app-config.json"
  echo "Created $TARGET/app-config.json"
fi

echo "Installed into $TARGET - open http://<server>/static/"
