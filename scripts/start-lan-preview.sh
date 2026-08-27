#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repository_root"

requested_port=${1:-${LAN_PREVIEW_PORT:-4175}}
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
      server.listen(port, "0.0.0.0", () => {
        server.close(() => process.stdout.write(String(port)));
      });
    };
    tryPort();
  ' "$requested_port"
)

printf 'Starting the LAN preview on the first free port at or above %s.\n' "$requested_port"
exec npm run dev:web -- --host 0.0.0.0 --port "$port" --strictPort
