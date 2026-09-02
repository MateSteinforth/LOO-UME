#!/bin/sh
set -eu

installed_launcher="$HOME/Applications/LOO UME.app/Contents/MacOS/LOO-UME"
package_directory=$(CDPATH= cd -- "${0%/*}" && pwd -P)
packaged_launcher="$package_directory/LOO UME.app/Contents/MacOS/LOO-UME"

if [ -x "$packaged_launcher" ]; then
  exec /bin/sh "$packaged_launcher" --uninstall
fi
if [ -x "$installed_launcher" ]; then
  exec /bin/sh "$installed_launcher" --uninstall
fi

printf 'LOO/UME is not installed in ~/Applications.\n'
printf 'Press Return to close.\n'
IFS= read -r _unused
