#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
expected_revision=$(sed -n '1p' "$repo_root/wasm/upstream-revision.txt")
gitlink_revision=$(git -C "$repo_root" rev-parse HEAD:wled/upstream)

if [ "$gitlink_revision" != "$expected_revision" ]; then
  echo "WLED pin mismatch: gitlink is $gitlink_revision but wasm/upstream-revision.txt expects $expected_revision" >&2
  exit 1
fi

git -C "$repo_root" submodule update --init --depth 1 -- wled/upstream
actual_revision=$(git -C "$repo_root/wled/upstream" rev-parse HEAD)

if [ "$actual_revision" != "$expected_revision" ]; then
  echo "WLED checkout mismatch: expected $expected_revision, found $actual_revision" >&2
  exit 1
fi

echo "WLED initialized at $actual_revision"
