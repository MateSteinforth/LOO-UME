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

install_manifest="$repository_root/toolchains/bootstrap/install-manifest.json"
node_root="$repository_root/.tools/node"
node_executable="$node_root/bin/node"
npm_cli="$node_root/lib/node_modules/npm/bin/npm-cli.js"

use_managed_node() {
  "$executable" verify --manifest "$install_manifest" --root "$repository_root"
  if [ ! -x "$node_executable" ] || [ ! -f "$npm_cli" ]; then
    echo "bootstrap: the verified Node installation is incomplete." >&2
    exit 1
  fi
  PATH="$node_root/bin:$PATH"
  export PATH
}

case "${1-}" in
  setup)
    if [ "$#" -ne 1 ]; then
      echo "usage: ./bootstrap.sh setup" >&2
      exit 2
    fi
    "$executable" install --manifest "$install_manifest" --root "$repository_root"
    use_managed_node
    cd "$repository_root"
    "$node_executable" "$npm_cli" ci
    "$node_executable" "$npm_cli" run build:desktop
    "$node_executable" "$npm_cli" run verify:desktop-install
    echo "WLED Orbital Lab is ready. Start it with ./bootstrap.sh desktop"
    exit 0
    ;;
  desktop)
    if [ "$#" -ne 1 ]; then
      echo "usage: ./bootstrap.sh desktop" >&2
      exit 2
    fi
    use_managed_node
    cd "$repository_root"
    exec "$node_executable" "$npm_cli" run desktop
    ;;
  npm)
    shift
    use_managed_node
    cd "$repository_root"
    exec "$node_executable" "$npm_cli" "$@"
    ;;
esac

exec "$executable" "$@"
