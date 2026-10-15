#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public

if [ ! -d public/controllers ]; then
    # Publish assets only after copying and manifest generation both succeed.
    controller_stage=""
    controller_checkout=$(mktemp -d)
    trap 'rm -rf "$controller_checkout" "$controller_stage"' EXIT
    controller_stage=$(mktemp -d ".controllers-stage.XXXXXX")
    git clone --depth 1 --filter=blob:none --sparse https://github.com/mixxxdj/mixxx.git "$controller_checkout/mixxx"
    git -C "$controller_checkout/mixxx" sparse-checkout set res/controllers
    cp -R "$controller_checkout/mixxx/res/controllers/." "$controller_stage"
    node etc/controller-manifest.mjs "$controller_stage"
    # rename fails safely if another setup has already published its assets.
    node -e 'require("node:fs").renameSync(process.argv[1], process.argv[2])' "$controller_stage" public/controllers
else
    node etc/controller-manifest.mjs
fi
