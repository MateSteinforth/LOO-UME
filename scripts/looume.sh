#!/bin/sh
set -eu

case $0 in
  */*) script_directory=${0%/*} ;;
  *) script_directory=. ;;
esac
repository_root=$(CDPATH= cd -- "$script_directory/.." && pwd -P)
state_directory=${LOO_UME_STATE_DIRECTORY:-$repository_root/.tools/looume}
pid_file=$state_directory/server.pid
url_file=$state_directory/server.url
log_file=$state_directory/server.log
launch_lock=$state_directory/launch.lock
port=${LOO_UME_PORT:-4173}
url=http://127.0.0.1:$port/
curl_command=${LOO_UME_CURL_COMMAND:-/usr/bin/curl}
open_command=${LOO_UME_OPEN_COMMAND:-/usr/bin/open}
lsof_command=${LOO_UME_LSOF_COMMAND:-/usr/sbin/lsof}
lock_wait_seconds=${LOO_UME_LOCK_WAIT_SECONDS:-900}

case $lock_wait_seconds in
  ''|*[!0-9]*) echo "looume: LOO_UME_LOCK_WAIT_SECONDS must be an integer." >&2; exit 2 ;;
esac

case $port in
  ''|*[!0-9]*) echo "looume: LOO_UME_PORT must be an integer." >&2; exit 2 ;;
esac
if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
  echo "looume: LOO_UME_PORT must be from 1 through 65535." >&2
  exit 2
fi

mkdir -p "$state_directory"
chmod 700 "$state_directory"

read_owned_pid() {
  owned_pid=
  [ -f "$pid_file" ] || return 1
  IFS= read -r candidate_pid < "$pid_file" || return 1
  case $candidate_pid in
    ''|*[!0-9]*) return 1 ;;
  esac
  kill -0 "$candidate_pid" 2>/dev/null || return 1
  candidate_command=$(/bin/ps -p "$candidate_pid" -o command= 2>/dev/null || true)
  case $candidate_command in
    *"$repository_root/bootstrap.sh launch"*|*"$repository_root/bootstrap.sh update"*|*"$repository_root/scripts/local-editor-server.ts"*)
      owned_pid=$candidate_pid
      return 0
      ;;
    *) return 1 ;;
  esac
}

discover_owned_pid() {
  owned_pid=
  [ -x "$lsof_command" ] || return 1
  server_ready || return 1
  candidate_pids=$(
    "$lsof_command" -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true
  )
  candidate_pid=
  for discovered_pid in $candidate_pids; do
    case $discovered_pid in
      ''|*[!0-9]*) continue ;;
    esac
    if [ -n "$candidate_pid" ] && [ "$candidate_pid" != "$discovered_pid" ]; then
      return 1
    fi
    candidate_pid=$discovered_pid
  done
  [ -n "$candidate_pid" ] || return 1
  kill -0 "$candidate_pid" 2>/dev/null || return 1
  candidate_command=$(/bin/ps -p "$candidate_pid" -o command= 2>/dev/null || true)
  case $candidate_command in
    *"$repository_root/bootstrap.sh launch"*|*"$repository_root/bootstrap.sh update"*|*"$repository_root/scripts/local-editor-server.ts"*)
      printf '%s\n' "$candidate_pid" > "$pid_file"
      owned_pid=$candidate_pid
      echo "LOO/UME recovered the ownership record for the existing managed server."
      return 0
      ;;
    *) return 1 ;;
  esac
}

read_or_discover_owned_pid() {
  read_owned_pid || discover_owned_pid
}

port_responds() {
  "$curl_command" --silent --show-error --max-time 2 "$url" >/dev/null 2>&1
}

server_ready() {
  readiness=$(
    "$curl_command" --fail --silent --show-error --max-time 2 \
      "${url}api/generator-status" 2>/dev/null
  ) || return 1
  printf '%s' "$readiness" | /usr/bin/grep -Fq '"schemaVersion":"1.0.0"' &&
    printf '%s' "$readiness" | /usr/bin/grep -Fq '"generator":"manifold"'
}

lock_claim_owner_is_live() {
  claim_path=$1
  lock_script=$2
  [ -L "$claim_path" ] || return 1
  lock_pid=$(readlink "$claim_path") || return 1
  case $lock_pid in
    ''|*[!0-9]*) return 1 ;;
  esac
  kill -0 "$lock_pid" 2>/dev/null || return 1
  lock_command=$(/bin/ps -p "$lock_pid" -o command= 2>/dev/null || true)
  case $lock_command in
    *"$lock_script"*) return 0 ;;
    *) return 1 ;;
  esac
}

legacy_lock_owner_is_live() {
  legacy_lock_path=$1
  lock_script=$2
  [ -f "$legacy_lock_path/owner.pid" ] || return 1
  IFS= read -r lock_pid < "$legacy_lock_path/owner.pid" || return 1
  case $lock_pid in
    ''|*[!0-9]*) return 1 ;;
  esac
  kill -0 "$lock_pid" 2>/dev/null || return 1
  lock_command=$(/bin/ps -p "$lock_pid" -o command= 2>/dev/null || true)
  case $lock_command in
    *"$lock_script"*) return 0 ;;
    *) return 1 ;;
  esac
}

remove_stale_lock_claims() {
  claims_base=$1
  lock_script=$2
  if [ -d "$claims_base" ] && ! legacy_lock_owner_is_live "$claims_base" "$lock_script"; then
    rm -f "$claims_base/owner.pid"
    rmdir "$claims_base" 2>/dev/null || true
  fi
  for claim_candidate in "$claims_base".claim.*; do
    [ -L "$claim_candidate" ] || continue
    if ! lock_claim_owner_is_live "$claim_candidate" "$lock_script"; then
      rm -f "$claim_candidate"
    fi
  done
}

lock_exists() {
  [ -d "$1" ] && return 0
  for claim_candidate in "$1".claim.*; do
    [ -L "$claim_candidate" ] && return 0
  done
  return 1
}

try_acquire_launch_lock() {
  [ -d "$launch_lock" ] && return 1
  lock_timestamp=$(date +%s)
  launch_lock_claim=$launch_lock.claim.$lock_timestamp.$$
  ln -s "$$" "$launch_lock_claim" 2>/dev/null || return 1
  if [ -n "${LOO_UME_TEST_AFTER_LOCK_ACQUIRE:-}" ]; then
    "$LOO_UME_TEST_AFTER_LOCK_ACQUIRE"
  fi
  sleep 1
  remove_stale_lock_claims "$launch_lock" "$repository_root/scripts/looume.sh"
  if [ -d "$launch_lock" ]; then
    rm -f "$launch_lock_claim"
    launch_lock_claim=
    return 1
  fi
  first_lock_claim=
  for claim_candidate in "$launch_lock".claim.*; do
    [ -L "$claim_candidate" ] || continue
    first_lock_claim=$claim_candidate
    break
  done
  if [ "$first_lock_claim" = "$launch_lock_claim" ]; then
    return 0
  fi
  rm -f "$launch_lock_claim"
  launch_lock_claim=
  return 1
}

open_editor() {
  if [ -x "$open_command" ]; then
    echo "Opening the browser at $url"
    if ! "$open_command" "$url"; then
      echo "looume: the browser did not open. Open $url manually." >&2
      return 1
    fi
  else
    echo "LOO/UME is available at $url"
  fi
}

clear_stale_state() {
  if ! read_owned_pid; then
    rm -f "$pid_file" "$url_file"
  fi
}

wait_for_server() {
  wait_seconds=${1:-900}
  elapsed=0
  while [ "$elapsed" -lt "$wait_seconds" ]; do
    if read_owned_pid && server_ready; then
      printf '%s\n' "$url" > "$url_file"
      return 0
    fi
    if ! read_owned_pid; then
      echo "looume: LOO/UME stopped before it became ready. See $log_file" >&2
      return 1
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  echo "looume: LOO/UME did not become ready within $wait_seconds seconds. See $log_file" >&2
  return 1
}

start_server() {
  start_mode=${1:-launch}
  open_after=${2:-true}
  clear_stale_state
  if read_or_discover_owned_pid && server_ready; then
    if [ "$open_after" = true ]; then open_editor; fi
    echo "LOO/UME is already running at $url"
    return 0
  fi
  if ! read_or_discover_owned_pid && port_responds; then
    echo "looume: port $port is in use by a process that is not the managed LOO/UME server." >&2
    return 1
  fi
  remove_stale_lock_claims "$launch_lock" "$repository_root/scripts/looume.sh"
  if ! try_acquire_launch_lock; then
    elapsed=0
    while lock_exists "$launch_lock" && [ "$elapsed" -lt "$lock_wait_seconds" ]; do
      remove_stale_lock_claims "$launch_lock" "$repository_root/scripts/looume.sh"
      if read_or_discover_owned_pid && server_ready; then
        if [ "$open_after" = true ]; then open_editor; fi
        echo "LOO/UME is already running at $url"
        return 0
      fi
      sleep 1
      elapsed=$((elapsed + 1))
    done
    if lock_exists "$launch_lock"; then
      echo "looume: another launch did not finish within $lock_wait_seconds seconds." >&2
      return 1
    fi
    start_server "$start_mode" "$open_after"
    return
  fi
  release_launch_lock() {
    if [ -n "${launch_lock_claim:-}" ] && [ -L "$launch_lock_claim" ] &&
       [ "$(readlink "$launch_lock_claim")" = "$$" ]; then
      rm -f "$launch_lock_claim"
    fi
  }
  stop_log_follow() {
    if [ -n "${log_tail_pid:-}" ] && kill -0 "$log_tail_pid" 2>/dev/null; then
      kill "$log_tail_pid" 2>/dev/null || true
      wait "$log_tail_pid" 2>/dev/null || true
    fi
    log_tail_pid=
  }
  release_launch_resources() {
    stop_log_follow
    release_launch_lock
  }
  trap release_launch_resources EXIT
  trap 'exit 130' HUP INT TERM
  clear_stale_state
  if read_or_discover_owned_pid && server_ready; then
    release_launch_lock
    trap - EXIT HUP INT TERM
    if [ "$open_after" = true ]; then open_editor; fi
    echo "LOO/UME is already running at $url"
    return 0
  fi
  if ! read_or_discover_owned_pid && port_responds; then
    release_launch_lock
    trap - EXIT HUP INT TERM
    echo "looume: port $port is in use by a process that is not the managed LOO/UME server." >&2
    return 1
  fi
  if read_owned_pid; then
    echo "LOO/UME is starting. Waiting for $url"
  else
    : > "$log_file"
    if [ "$start_mode" = update ]; then
      nohup env LOO_UME_MANAGED_LAUNCHER=1 LOO_UME_OPEN_BROWSER=0 \
        ORBITAL_LAB_PORT="$port" "$repository_root/bootstrap.sh" update \
        >> "$log_file" 2>&1 &
    else
      nohup env LOO_UME_MANAGED_LAUNCHER=1 LOO_UME_OPEN_BROWSER=0 \
        ORBITAL_LAB_PORT="$port" "$repository_root/bootstrap.sh" launch \
        >> "$log_file" 2>&1 &
    fi
    printf '%s\n' "$!" > "$pid_file"
  fi
  log_tail_pid=
  if [ "${LOO_UME_FOLLOW_LOG:-0}" = 1 ]; then
    /usr/bin/tail -n +1 -f "$log_file" &
    log_tail_pid=$!
  fi
  wait_for_server 900
  stop_log_follow
  release_launch_lock
  trap - EXIT HUP INT TERM
  if [ "$open_after" = true ]; then open_editor; fi
  echo "LOO/UME is running at $url"
}

stop_server() {
  clear_stale_state
  if ! read_or_discover_owned_pid; then
    if port_responds; then
      echo "looume: port $port is active, but its process ownership could not be verified. Nothing was stopped." >&2
      return 1
    fi
    echo "LOO/UME is not running."
    return 0
  fi
  echo "Stopping the managed LOO/UME server (PID $owned_pid)."
  kill -TERM "$owned_pid"
  elapsed=0
  while kill -0 "$owned_pid" 2>/dev/null && [ "$elapsed" -lt 20 ]; do
    sleep 1
    elapsed=$((elapsed + 1))
  done
  if kill -0 "$owned_pid" 2>/dev/null; then
    echo "looume: the server did not stop within 20 seconds." >&2
    return 1
  fi
  if port_responds; then
    echo "looume: port $port is still active after the managed server stopped." >&2
    return 1
  fi
  rm -f "$pid_file" "$url_file"
  echo "LOO/UME stopped."
}

case ${1-} in
  ''|launch)
    [ "$#" -le 1 ] || { echo "usage: looume [--update|--stop|--status]" >&2; exit 2; }
    start_server launch true
    ;;
  --update)
    [ "$#" -eq 1 ] || { echo "usage: looume --update" >&2; exit 2; }
    stop_server
    start_server update true
    ;;
  --stop)
    [ "$#" -eq 1 ] || { echo "usage: looume --stop" >&2; exit 2; }
    stop_server
    ;;
  --status)
    [ "$#" -eq 1 ] || { echo "usage: looume --status" >&2; exit 2; }
    clear_stale_state
    if read_owned_pid && server_ready; then
      echo "LOO/UME is running at $url (PID $owned_pid)."
    elif read_owned_pid; then
      echo "LOO/UME is starting (PID $owned_pid)."
    else
      echo "LOO/UME is not running."
    fi
    ;;
  --restart-after-update)
    [ "$#" -eq 1 ] || exit 2
    rm -f "$pid_file" "$url_file"
    start_server launch false
    ;;
  *)
    echo "usage: looume [--update|--stop|--status]" >&2
    exit 2
    ;;
esac
