verify_update_checkout() {
  update_root=$1
  update_git=$2
  approved_origin=$3

  if [ "$($update_git -C "$update_root" branch --show-current)" != "main" ]; then
    echo "bootstrap: update requires the main branch." >&2
    return 1
  fi
  if [ -n "$($update_git -C "$update_root" status --porcelain --untracked-files=normal)" ]; then
    echo "bootstrap: update requires a clean checkout. Commit or remove local changes first." >&2
    return 1
  fi
  origin_url=$($update_git -C "$update_root" remote get-url origin 2>/dev/null || true)
  if [ "$origin_url" != "$approved_origin" ]; then
    echo "bootstrap: origin is not the approved LOO/UME repository." >&2
    return 1
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
