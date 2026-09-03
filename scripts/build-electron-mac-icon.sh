#!/bin/sh
set -eu

if [ "$(uname -s)" != "Darwin" ]; then
  echo "The Electron Mac icon must be built on macOS." >&2
  exit 1
fi

output_directory="build/electron"
temporary_directory=$(mktemp -d "${TMPDIR:-/tmp}/loo-ume-electron-icon.XXXXXX")
trap 'rm -rf "$temporary_directory"' EXIT HUP INT TERM
iconset="$temporary_directory/AppIcon.iconset"
mkdir -p "$output_directory" "$iconset"
node scripts/render-electron-mac-icon.mjs macos/AppIcon.svg "$iconset"
/usr/bin/iconutil -c icns "$iconset" -o "$output_directory/AppIcon.icns"
echo "Built $output_directory/AppIcon.icns"
