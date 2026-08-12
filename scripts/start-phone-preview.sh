#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repository_root"

cloudflared="$repository_root/.tools/cloudflared"
if [ ! -x "$cloudflared" ]; then
  echo "Missing executable .tools/cloudflared. Install the repository tool first." >&2
  exit 1
fi

requested_port=${1:-${PHONE_PREVIEW_PORT:-4175}}
case "$requested_port" in
  *[!0-9]*|"")
    echo "Port must be a positive integer." >&2
    exit 1
    ;;
esac
if [ "$requested_port" -lt 1 ] || [ "$requested_port" -gt 65535 ]; then
  echo "Port must be between 1 and 65535." >&2
  exit 1
fi

endpoint_ready() {
  base_url=$1
  endpoint=$2
  expected_type=$3
  result=$(curl -L --silent --show-error --max-time 10 \
    -o /dev/null -w '%{http_code} %{content_type}' \
    "$base_url$endpoint" 2>/dev/null || true)
  case "$result" in
    "200 $expected_type"*)
      return 0
      ;;
  esac
  return 1
}

preview_ready() {
  base_url=$1
  endpoint_ready "$base_url" / text/html &&
    endpoint_ready "$base_url" /src/main.ts text/javascript &&
    endpoint_ready "$base_url" \
      /sculptures/rhombicosidodecahedron/sculpture.json application/json &&
    endpoint_ready "$base_url" /wasm/wled-engine.js text/javascript &&
    endpoint_ready "$base_url" /wasm/wled-engine.wasm application/wasm
}

# Reuse a healthy repository preview before allocating another free tunnel.
candidate_port=$requested_port
last_reuse_port=$((requested_port + 24))
if [ "$last_reuse_port" -gt 65535 ]; then
  last_reuse_port=65535
fi
while [ "$candidate_port" -le "$last_reuse_port" ]; do
  candidate_log="/tmp/led-rhombo-cloudflared-$candidate_port.log"
  candidate_url=
  if [ -f "$candidate_log" ]; then
    candidate_url=$(sed -n \
      's#.*\(https://[-a-z0-9]*\.trycloudflare\.com\).*#\1#p' \
      "$candidate_log" | head -n 1)
  fi
  if [ -n "$candidate_url" ] &&
    curl --fail --silent --show-error --max-time 2 \
      "http://127.0.0.1:$candidate_port/" >/dev/null 2>&1 &&
    preview_ready "$candidate_url"; then
    printf '%s\n' \
      "Phone review URL: $candidate_url" \
      "Reused the healthy preview on port $candidate_port." \
      "Verified HTML, app JavaScript, sculpture JSON, WLED JavaScript, and WLED WASM." \
      "Temporary review link only; no uptime guarantee."
    exit 0
  fi
  candidate_port=$((candidate_port + 1))
done

port=$(
  node -e '
    const net = require("node:net");
    let port = Number(process.argv[1]);
    const tryPort = () => {
      const server = net.createServer();
      server.unref();
      server.once("error", () => {
        port += 1;
        if (port > 65535) process.exit(1);
        tryPort();
      });
      server.listen(port, "127.0.0.1", () => {
        server.close(() => process.stdout.write(String(port)));
      });
    };
    tryPort();
  ' "$requested_port"
)

if [ ! -f web/public/sculptures/manifest.json ]; then
  npm run stage:sculptures
fi
if [ ! -f web/public/wasm/wled-engine.js ] ||
  [ ! -f web/public/wasm/wled-engine.wasm ]; then
  npm run build:wasm
fi

vite_log="/tmp/led-rhombo-vite-$port.log"
tunnel_log="/tmp/led-rhombo-cloudflared-$port.log"
: >"$vite_log"
: >"$tunnel_log"

vite_pid=
tunnel_pid=
cleanup_failed_start() {
  if [ -n "$tunnel_pid" ]; then
    kill "$tunnel_pid" 2>/dev/null || true
  fi
  if [ -n "$vite_pid" ]; then
    kill "$vite_pid" 2>/dev/null || true
  fi
}
trap cleanup_failed_start 0 1 2 15

setsid env __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=.trycloudflare.com \
  "$repository_root/node_modules/.bin/vite" \
  --host 0.0.0.0 --port "$port" --strictPort \
  >"$vite_log" 2>&1 </dev/null &
vite_pid=$!

attempt=0
until curl --fail --silent --show-error --max-time 2 \
  "http://127.0.0.1:$port/" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 50 ]; then
    echo "Vite did not become ready. See $vite_log" >&2
    exit 1
  fi
  sleep 0.2
done

setsid "$cloudflared" tunnel --no-autoupdate \
  --url "http://127.0.0.1:$port" \
  >"$tunnel_log" 2>&1 </dev/null &
tunnel_pid=$!

attempt=0
review_url=
while [ -z "$review_url" ]; do
  review_url=$(sed -n \
    's#.*\(https://[-a-z0-9]*\.trycloudflare\.com\).*#\1#p' \
    "$tunnel_log" | head -n 1)
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 100 ]; then
    echo "TryCloudflare did not provide a URL. See $tunnel_log" >&2
    exit 1
  fi
  sleep 0.2
done

attempt=0
until grep -q "Registered tunnel connection" "$tunnel_log"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 100 ]; then
    echo "TryCloudflare did not register the tunnel. See $tunnel_log" >&2
    exit 1
  fi
  sleep 0.2
done
# Avoid caching an NXDOMAIN response while the new hostname reaches DNS.
sleep 2

verify_endpoint() {
  endpoint=$1
  expected_type=$2
  attempt=0
  while :; do
    if endpoint_ready "$review_url" "$endpoint" "$expected_type"; then return; fi
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 60 ]; then
      echo "Public verification failed for $endpoint: $result" >&2
      exit 1
    fi
    sleep 0.5
  done
}

verify_endpoint / text/html
verify_endpoint /src/main.ts text/javascript
verify_endpoint /sculptures/rhombicosidodecahedron/sculpture.json application/json
verify_endpoint /wasm/wled-engine.js text/javascript
verify_endpoint /wasm/wled-engine.wasm application/wasm

trap - 0 1 2 15
printf '%s\n' \
  "Phone review URL: $review_url" \
  "Verified HTML, app JavaScript, sculpture JSON, WLED JavaScript, and WLED WASM." \
  "Vite log: $vite_log" \
  "Tunnel log: $tunnel_log" \
  "Temporary review link only; no uptime guarantee."
