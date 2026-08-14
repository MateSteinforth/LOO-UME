#!/bin/sh
set -eu

case $0 in
  */*) script_directory=${0%/*} ;;
  *) script_directory=. ;;
esac
repository_root=$(CDPATH= cd -- "$script_directory/.." && pwd -P)
first=$(mktemp -d "${TMPDIR:-/tmp}/orbital-bootstrap-check-a.XXXXXX")
second=$(mktemp -d "${TMPDIR:-/tmp}/orbital-bootstrap-check-b.XXXXXX")
trap 'rm -rf "$first" "$second"' EXIT HUP INT TERM

BOOTSTRAP_BUILD_DIRECTORY="$first" sh "$repository_root/scripts/build-bootstrap.sh"
BOOTSTRAP_BUILD_DIRECTORY="$second" sh "$repository_root/scripts/build-bootstrap.sh"

for relative in \
  bin/linux-x64/orbital-bootstrap \
  bin/darwin-arm64/orbital-bootstrap \
  bin/darwin-x64/orbital-bootstrap \
  SHA256SUMS
do
  cmp "$first/$relative" "$second/$relative"
  cmp "$first/$relative" "$repository_root/toolchains/bootstrap/$relative"
done

echo "The bootstrap executables are reproducible and match the committed files."
