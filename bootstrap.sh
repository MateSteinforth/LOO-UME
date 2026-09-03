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
build_receipt="$repository_root/.tools/desktop-build-receipt.json"
build_receipt_tool="$repository_root/scripts/desktop-build-receipt.mjs"
update_apply="$repository_root/scripts/bootstrap-update-apply.sh"

require_git() {
  if [ ! -x /usr/bin/git ]; then
    echo "bootstrap: required host tool /usr/bin/git is unavailable." >&2
    exit 1
  fi
}

use_managed_node() {
  "$executable" verify --manifest "$install_manifest" --root "$repository_root"
  if [ ! -x "$node_executable" ] || [ ! -f "$npm_cli" ]; then
    echo "bootstrap: the verified Node installation is incomplete." >&2
    exit 1
  fi
  PATH="$node_root/bin:$PATH"
  export PATH
}

install_and_build_if_required() {
  force_build=${1-}
  "$executable" install --manifest "$install_manifest" --root "$repository_root"
  use_managed_node
  require_git
  cd "$repository_root"

  current_commit=$(/usr/bin/git rev-parse --verify HEAD)
  checkout_state=$(/usr/bin/git status --porcelain --untracked-files=normal)

  if [ "$force_build" != "force" ] &&
     [ -z "$checkout_state" ] &&
     [ -x "$repository_root/node_modules/.bin/tsx" ] &&
     [ -f "$repository_root/node_modules/manifold-3d/package.json" ] &&
     "$node_executable" "$build_receipt_tool" verify \
       --root "$repository_root" \
       --receipt "$build_receipt" \
       --target "$target" \
       --commit "$current_commit" 2>/dev/null; then
    echo "LOO/UME build is current at $current_commit."
    return
  fi

  rm -f "$build_receipt"
  "$node_executable" "$npm_cli" ci
  "$node_executable" "$npm_cli" run build:desktop
  "$node_executable" "$npm_cli" run verify:desktop-install
  checkout_state=$(/usr/bin/git status --porcelain --untracked-files=normal)
  if [ -z "$checkout_state" ]; then
    "$node_executable" "$build_receipt_tool" create \
      --root "$repository_root" \
      --receipt "$build_receipt" \
      --target "$target" \
      --commit "$current_commit"
  else
    echo "LOO/UME built the modified checkout. A clean commit is required before this build can be reused."
  fi
}

case "${1-}" in
  setup)
    if [ "$#" -ne 1 ]; then
      echo "usage: ./bootstrap.sh setup" >&2
      exit 2
    fi
    install_and_build_if_required force
    echo "LOO/UME is ready. Start it with ./bootstrap.sh launch"
    exit 0
    ;;
  launch)
    if [ "$#" -ne 1 ]; then
      echo "usage: ./bootstrap.sh launch" >&2
      exit 2
    fi
    install_and_build_if_required
    cd "$repository_root"
    if [ "${LOO_UME_OPEN_BROWSER-1}" = 0 ]; then
      exec "$node_executable" "$repository_root/node_modules/tsx/dist/cli.mjs" \
        "$repository_root/scripts/local-editor-server.ts"
    fi
    exec "$node_executable" "$repository_root/node_modules/tsx/dist/cli.mjs" \
      "$repository_root/scripts/local-editor-server.ts" --open-browser
    ;;
  update)
    if [ "$#" -ne 1 ]; then
      echo "usage: ./bootstrap.sh update" >&2
      exit 2
    fi
    require_git
    "$update_apply"
    exec "$repository_root/bootstrap.sh" launch
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
  review-electron)
    if [ "$#" -ne 1 ]; then
      echo "usage: ./bootstrap.sh review-electron" >&2
      exit 2
    fi
    install_and_build_if_required
    cd "$repository_root"
    exec "$node_executable" "$npm_cli" run review:electron:mac
    ;;
  npm)
    shift
    use_managed_node
    cd "$repository_root"
    exec "$node_executable" "$npm_cli" "$@"
    ;;
esac

exec "$executable" "$@"
