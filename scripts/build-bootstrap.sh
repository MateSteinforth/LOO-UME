#!/bin/sh
set -eu

case $0 in
  */*) script_directory=${0%/*} ;;
  *) script_directory=. ;;
esac
repository_root=$(CDPATH= cd -- "$script_directory/.." && pwd -P)

if [ $# -gt 1 ]; then
  echo "usage: scripts/build-bootstrap.sh [--check]" >&2
  exit 2
fi
if [ "${1-}" = "--check" ]; then
  exec sh "$repository_root/scripts/check-bootstrap-build.sh"
fi
if [ $# -ne 0 ]; then
  echo "usage: scripts/build-bootstrap.sh [--check]" >&2
  exit 2
fi
go_command=${GO_BOOTSTRAP:-go}

if [ "$("$go_command" version)" != "go version go1.26.6 linux/amd64" ]; then
  echo "build-bootstrap: GO_BOOTSTRAP must name Go 1.26.6 for linux/amd64." >&2
  exit 1
fi

source_directory="$repository_root/toolchains/bootstrap/src"
bootstrap_directory=${BOOTSTRAP_BUILD_DIRECTORY:-"$repository_root/toolchains/bootstrap"}
output_directory="$bootstrap_directory/bin"
mkdir -p "$output_directory/linux-x64" "$output_directory/darwin-arm64" "$output_directory/darwin-x64"

build_one() {
  target=$1
  goos=$2
  goarch=$3
  output="$output_directory/$target/orbital-bootstrap"
  (
    cd "$source_directory"
    env CGO_ENABLED=0 GOTOOLCHAIN=local GOOS="$goos" GOARCH="$goarch" GOAMD64=v1 LC_ALL=C TZ=UTC SOURCE_DATE_EPOCH=1786665600 \
      "$go_command" build -mod=readonly -trimpath -buildvcs=false \
      -ldflags="-s -w -buildid= -X main.buildTarget=$target" \
      -o "$output" ./cmd/orbital-bootstrap
  )
  chmod 0755 "$output"
}

build_one linux-x64 linux amd64
build_one darwin-arm64 darwin arm64
build_one darwin-x64 darwin amd64

(
  cd "$bootstrap_directory"
  sha256sum bin/linux-x64/orbital-bootstrap bin/darwin-arm64/orbital-bootstrap bin/darwin-x64/orbital-bootstrap > SHA256SUMS
)
