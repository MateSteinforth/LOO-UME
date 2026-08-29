#!/bin/sh
set -eu

case $0 in
  */*) script_directory=${0%/*} ;;
  *) script_directory=. ;;
esac
repository_root=$(CDPATH= cd -- "$script_directory/.." && pwd -P)
git_executable=/usr/bin/git
approved_origin=https://github.com/MateSteinforth/LOO-UME.git

. "$repository_root/scripts/bootstrap-update-guard.sh"
verify_update_checkout "$repository_root" "$git_executable" "$approved_origin"
acquire_update_lock "$repository_root" "$git_executable"
trap release_update_lock EXIT
"$git_executable" -C "$repository_root" fetch --prune origin main
verify_update_fast_forward "$repository_root" "$git_executable"
verify_ignored_project_collisions "$repository_root" "$git_executable"
apply_update_with_preserved_changes "$repository_root" "$git_executable"
