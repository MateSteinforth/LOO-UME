#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
expected_target=${1:-}

case "$expected_target" in
  linux-x64|darwin-arm64|darwin-x64) ;;
  *)
    echo "Usage: sh scripts/verify-bootstrap-binaries.sh TARGET" >&2
    exit 2
    ;;
esac

bootstrap_root="$repo_root/toolchains/bootstrap"
binary="$bootstrap_root/bin/$expected_target/orbital-bootstrap"
checksums="$bootstrap_root/SHA256SUMS"

test -x "$binary"
test -f "$checksums"

(
  cd "$bootstrap_root"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum --check SHA256SUMS
  elif [ -x /usr/bin/shasum ]; then
    /usr/bin/shasum -a 256 --check SHA256SUMS
  else
    echo "A SHA-256 audit command is required for this verification step." >&2
    exit 1
  fi
)

actual_target=$("$binary" target)
if [ "$actual_target" != "$expected_target" ]; then
  echo "Stage-zero target mismatch: expected $expected_target, found $actual_target." >&2
  exit 1
fi

expected_version="orbital-bootstrap 1.0.0 ($expected_target; go1.26.6)"
actual_version=$("$binary" version)
if [ "$actual_version" != "$expected_version" ]; then
  echo "Stage-zero version mismatch: expected $expected_version, found $actual_version." >&2
  exit 1
fi

selector_target=$(sh "$repo_root/bootstrap.sh" target)
if [ "$selector_target" != "$expected_target" ]; then
  echo "Bootstrap selector mismatch: expected $expected_target, found $selector_target." >&2
  exit 1
fi

selector_version=$(sh "$repo_root/bootstrap.sh" version)
if [ "$selector_version" != "$expected_version" ]; then
  echo "Bootstrap selector used an unexpected executable." >&2
  exit 1
fi

"$binary" self-test --root "$repo_root"

echo "Verified committed stage-zero executable for $expected_target."
