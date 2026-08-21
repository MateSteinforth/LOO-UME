#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_root"

npm run setup:wled
npm ci
npm run setup:emsdk
npm run verify
