verify_update_checkout() {
  update_root=$1
  update_git=$2
  approved_origin=$3

  if [ "$($update_git -C "$update_root" branch --show-current)" != "main" ]; then
    echo "bootstrap: update requires the main branch." >&2
    return 1
  fi
  origin_url=$($update_git -C "$update_root" remote get-url origin 2>/dev/null || true)
  if [ "$origin_url" != "$approved_origin" ]; then
    echo "bootstrap: origin is not the approved LOO/UME repository." >&2
    return 1
  fi
}

acquire_update_lock() {
  update_root=$1
  update_git=$2
  update_lock_path=$($update_git -C "$update_root" rev-parse --git-path loo-ume-update.lock)
  case "$update_lock_path" in
    /*) ;;
    *) update_lock_path=$update_root/$update_lock_path ;;
  esac
  if ! mkdir "$update_lock_path" 2>/dev/null; then
    echo "bootstrap: another LOO/UME update is already running. If no update is active, remove $update_lock_path." >&2
    return 1
  fi
}

release_update_lock() {
  if [ -n "${update_lock_path-}" ]; then
    rmdir "$update_lock_path" 2>/dev/null || true
  fi
}

verify_ignored_project_collisions() {
  update_root=$1
  update_git=$2
  update_project_paths=$($update_git -C "$update_root" ls-files \
    --others --ignored --exclude-standard -- projects/local)
  update_old_ifs=$IFS
  IFS='
'
  for update_project_path in $update_project_paths; do
    case "$update_project_path" in
      projects/local/*.loo.zip)
        if $update_git -C "$update_root" cat-file -e \
          "origin/main:$update_project_path" 2>/dev/null; then
          IFS=$update_old_ifs
          echo "bootstrap: update stopped because origin/main contains the local project path $update_project_path." >&2
          return 1
        fi
        ;;
    esac
  done
  IFS=$update_old_ifs
}

apply_update_with_preserved_changes() {
  update_root=$1
  update_git=$2
  update_changes=$($update_git -C "$update_root" status --porcelain --untracked-files=normal)
  update_stash_created=false
  update_restore_pending=false
  update_stash_commit=

  drop_exact_update_stash() {
    update_stash_ref=
    update_stash_lines=$($update_git -C "$update_root" stash list --format='%H %gd')
    update_old_ifs=$IFS
    IFS='
'
    for update_stash_line in $update_stash_lines; do
      update_stash_hash=${update_stash_line%% *}
      if [ "$update_stash_hash" = "$update_stash_commit" ]; then
        update_stash_ref=${update_stash_line#* }
        break
      fi
    done
    IFS=$update_old_ifs
    if [ -z "$update_stash_ref" ]; then
      echo "bootstrap: preserved-change stash $update_stash_commit could not be located." >&2
      return 1
    fi
    $update_git -C "$update_root" stash drop "$update_stash_ref" >/dev/null
  }

  restore_preserved_update_changes() {
    if [ "$update_restore_pending" != true ]; then return 0; fi
    if ! $update_git -C "$update_root" stash apply --index \
      "$update_stash_commit" >/dev/null; then
      update_restore_pending=false
      return 1
    fi
    update_restore_pending=false
    drop_exact_update_stash
  }

  interrupt_preserved_update() {
    echo "bootstrap: update interrupted; restoring preserved local changes." >&2
    restore_preserved_update_changes ||
      echo "bootstrap: automatic restore needs manual conflict resolution. The backup remains in git stash." >&2
    trap - HUP INT TERM
    exit 130
  }

  if [ -n "$update_changes" ]; then
    echo "bootstrap: preserving local changes before the application update."
    $update_git -C "$update_root" stash push --include-untracked \
      --message "LOO/UME automatic update backup" >/dev/null
    update_stash_commit=$($update_git -C "$update_root" rev-parse --verify refs/stash)
    update_stash_created=true
    update_restore_pending=true
    trap interrupt_preserved_update HUP INT TERM
  fi

  if ! $update_git -C "$update_root" merge --ff-only origin/main; then
    if [ "$update_stash_created" = true ]; then
      echo "bootstrap: update failed; restoring the preserved local changes." >&2
      restore_preserved_update_changes || {
        trap - HUP INT TERM
        echo "bootstrap: automatic restore needs manual conflict resolution. Recovery stash: $update_stash_commit" >&2
        return 1
      }
      trap - HUP INT TERM
    fi
    return 1
  fi

  if [ "$update_stash_created" = true ]; then
    if ! restore_preserved_update_changes; then
      trap - HUP INT TERM
      echo "bootstrap: application files updated, but local changes conflict with the new version." >&2
      echo "bootstrap: resolve the working-tree conflicts. Recovery stash: $update_stash_commit" >&2
      return 1
    fi
    echo "bootstrap: restored local changes after the application update."
    trap - HUP INT TERM
  fi
}

verify_update_fast_forward() {
  update_root=$1
  update_git=$2
  if ! $update_git -C "$update_root" merge-base --is-ancestor HEAD origin/main; then
    echo "bootstrap: local main has diverged from origin/main. Update stopped without changing files." >&2
    return 1
  fi
}
