#!/bin/sh
set -eu

case $0 in
  */*) bootstrap_directory=${0%/*} ;;
  *) bootstrap_directory=. ;;
esac
repository_root=$(CDPATH= cd -- "$bootstrap_directory" && pwd -P)

if [ ! -x /usr/bin/uname ]; then
  echo "bootstrap: required operating-system tool /usr/bin/uname is unavailable." >&2
  exit 1
fi
system_name=$(/usr/bin/uname -s)
machine_name=$(/usr/bin/uname -m)

case "$system_name:$machine_name" in
  Linux:x86_64|Linux:amd64)
    target=linux-x64
    ;;
  Darwin:arm64)
    target=darwin-arm64
    ;;
  Darwin:x86_64|Darwin:amd64)
    if [ -x /usr/sbin/sysctl ] && [ "$(/usr/sbin/sysctl -in sysctl.proc_translated 2>/dev/null || true)" = 1 ]; then
      echo "bootstrap: Rosetta is active. Start a native arm64 shell and run this command again." >&2
      exit 1
    fi
    target=darwin-x64
    ;;
  *)
    echo "bootstrap: unsupported system tuple $system_name/$machine_name." >&2
    exit 1
    ;;
esac

executable="$repository_root/toolchains/bootstrap/bin/$target/orbital-bootstrap"
if [ ! -x "$executable" ]; then
  echo "bootstrap: the reviewed $target executable is absent or not executable." >&2
  exit 1
fi

exec "$executable" "$@"
