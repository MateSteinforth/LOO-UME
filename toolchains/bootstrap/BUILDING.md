# Reviewed stage-zero bootstrap executables

The three files under `bin/` are built from `src/` with only the Go standard
library. The approved builder is the official Go 1.26.6 Linux x86-64 archive:

- URL: `https://go.dev/dl/go1.26.6.linux-amd64.tar.gz`
- Size: `66890545` bytes
- SHA-256: `708effb774be8237570d0add163225abbdfaf4fca28b2611df167beba4feef89`
- License: BSD-3-Clause. See `LICENSE-Go.txt`.

Extract the verified compiler outside the repository. Then run:

```sh
GO_BOOTSTRAP=/absolute/path/to/go/bin/go sh scripts/build-bootstrap.sh
```

The script requires exactly Go 1.26.6 on Linux x86-64. It disables CGO, uses
the local compiler only, removes build paths and the Go build ID, and builds
all three targets from the same source tree. A correct rebuild does not change
the files or `SHA256SUMS`.

Do not use UPX, Git LFS, an Apple SDK, a system TLS library, or a third-party Go
module. Run each committed binary on its native target after a rebuild.

The build receipt also pins the official Go 1.26.6 source archive:

- Source URL: `https://go.dev/dl/go1.26.6.src.tar.gz`
- Source SHA-256: `a0721c54c688901448d77ad9b3ec7ea7c474730755ff891382e92ecb93ff2cb1`
- License URL: `https://raw.githubusercontent.com/golang/go/go1.26.6/LICENSE`

Run the deterministic two-build and committed-byte check with:

```sh
GO_BOOTSTRAP=/absolute/path/to/go/bin/go sh scripts/build-bootstrap.sh --check
```

`build-receipt.json` binds the compiler, source-tree digest, build flags, binary
sizes, and binary SHA-256 values. Required CI downloads and verifies the pinned
compiler archive before it rebuilds the files. Native Linux and macOS jobs run
the exact committed executable, including its contained `self-test` command.
