#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
emsdk_dir="$repo_root/.tools/emsdk"
emscripten_version=$(sed -n '1p' "$repo_root/wasm/emscripten-version.txt")
emsdk_revision=$(sed -n '1p' "$repo_root/wasm/emsdk-revision.txt")

if [ ! -d "$emsdk_dir/.git" ]; then
  if [ -e "$emsdk_dir" ]; then
    echo "$emsdk_dir exists but is not an emsdk Git checkout" >&2
    exit 1
  fi
  mkdir -p "$(dirname -- "$emsdk_dir")"
  git init "$emsdk_dir"
  git -C "$emsdk_dir" remote add origin https://github.com/emscripten-core/emsdk.git
fi

current_revision=$(git -C "$emsdk_dir" rev-parse HEAD 2>/dev/null || true)
if [ "$current_revision" != "$emsdk_revision" ]; then
  git -C "$emsdk_dir" fetch --depth 1 origin "$emsdk_revision"
  git -C "$emsdk_dir" checkout --detach "$emsdk_revision"
fi

actual_revision=$(git -C "$emsdk_dir" rev-parse HEAD)
if [ "$actual_revision" != "$emsdk_revision" ]; then
  echo "emsdk checkout mismatch: expected $emsdk_revision, found $actual_revision" >&2
  exit 1
fi

"$emsdk_dir/emsdk" install "$emscripten_version"
"$emsdk_dir/emsdk" activate "$emscripten_version"

echo "Emscripten $emscripten_version installed from emsdk $emsdk_revision at $emsdk_dir"
