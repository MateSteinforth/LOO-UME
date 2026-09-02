#!/bin/sh
set -eu

if [ "$(uname -s)" != "Darwin" ]; then
  echo "The Electron Mac icon must be built on macOS." >&2
  exit 1
fi

output_directory="build/electron"
temporary_directory=$(mktemp -d "${TMPDIR:-/tmp}/loo-ume-electron-icon.XXXXXX")
trap 'rm -rf "$temporary_directory"' EXIT HUP INT TERM
icon_source_directory="$temporary_directory/source"
iconset="$temporary_directory/AppIcon.iconset"
mkdir -p "$output_directory" "$icon_source_directory" "$iconset"
/usr/bin/qlmanage -t -s 1024 -o "$icon_source_directory" macos/AppIcon.svg >/dev/null
icon_source="$icon_source_directory/AppIcon.svg.png"
test -s "$icon_source"

make_icon() {
  size=$1
  name=$2
  /usr/bin/sips -z "$size" "$size" "$icon_source" --out "$iconset/$name" >/dev/null
}

make_icon 16 icon_16x16.png
make_icon 32 icon_16x16@2x.png
make_icon 32 icon_32x32.png
make_icon 64 icon_32x32@2x.png
make_icon 128 icon_128x128.png
make_icon 256 icon_128x128@2x.png
make_icon 256 icon_256x256.png
make_icon 512 icon_256x256@2x.png
make_icon 512 icon_512x512.png
make_icon 1024 icon_512x512@2x.png
/usr/bin/iconutil -c icns "$iconset" -o "$output_directory/AppIcon.icns"
echo "Built $output_directory/AppIcon.icns"
