#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
output_directory="$repository_root/build/local-electron-review"

case "$(/usr/bin/uname -m)" in
  arm64)
    architecture_flag=--arm64
    application_directory=mac-arm64
    ;;
  x86_64)
    architecture_flag=--x64
    application_directory=mac
    ;;
  *)
    echo "local Electron review supports macOS arm64 and x86_64 only." >&2
    exit 1
    ;;
esac

cd "$repository_root"
npx electron-builder --mac dir "$architecture_flag" --publish never \
  --config.mac.notarize=false \
  --config.directories.output="$output_directory"

application="$output_directory/$application_directory/LOO UME.app"
if [ ! -d "$application" ]; then
  echo "local Electron review did not create $application." >&2
  exit 1
fi
executable="$application/Contents/MacOS/LOO UME"
user_data="$output_directory/user-data"
mkdir -p "$user_data"
echo "Local Electron logs will remain in this terminal."
echo "Desktop log: $user_data/logs/desktop.log"
exec /usr/bin/env \
  LOO_UME_LOCAL_ELECTRON_REVIEW=1 \
  LOO_UME_LOCAL_ELECTRON_REVIEW_DATA="$user_data" \
  "$executable"
