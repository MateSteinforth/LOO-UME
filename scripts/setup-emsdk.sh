#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
emsdk_dir="$repo_root/.tools/emsdk"
emscripten_version=$(sed -n '1p' "$repo_root/wasm/emscripten-version.txt")

if [ ! -d "$emsdk_dir/.git" ]; then
  git clone --depth 1 https://github.com/emscripten-core/emsdk.git "$emsdk_dir"
fi

"$emsdk_dir/emsdk" install "$emscripten_version"
"$emsdk_dir/emsdk" activate "$emscripten_version"

echo "Emscripten $emscripten_version installed at $emsdk_dir"
