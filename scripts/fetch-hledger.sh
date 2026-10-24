#!/usr/bin/env bash
# Downloads the hledger release the grammars target into .hledger/:
#   .hledger/bin/hledger  the hledger binary, used to check test inputs
#   .hledger/src/         hledger's example files and tests, used as parse fixtures
set -euo pipefail

HLEDGER_VERSION=1.52.4

root=$(cd "$(dirname "$0")/.." && pwd)
dest="$root/.hledger"
mkdir -p "$dest/bin"

# sha256 digests of the release assets, from GitHub's release metadata
case "$(uname -s)-$(uname -m)" in
    Darwin-arm64)
        platform=mac-arm64
        sha256=c90a0fe4537439e958ce530f7175d937749f5f126759c94c1212774abe9eb971
        ;;
    Darwin-x86_64)
        platform=mac-x64
        sha256=1e4d4114ca065f6f0f6e45453ec30571eb00989bf34d439c80042368ae22c49c
        ;;
    Linux-x86_64)
        platform=linux-x64
        sha256=f76a2e4088e162b7658e43077502569d5a6fdacd219b19bfb9aab6588b69643a
        ;;
    *)
        echo "No pinned hledger binary for $(uname -s) $(uname -m)" >&2
        exit 1
        ;;
esac

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

if [ "$("$dest/bin/hledger" --version 2>/dev/null | awk '{print $2}' | cut -d- -f1)" != "$HLEDGER_VERSION" ]; then
    echo "Downloading hledger $HLEDGER_VERSION ($platform)..."
    archive="$tmp/hledger.tar.gz"
    curl -fsSL -o "$archive" \
        "https://github.com/simonmichael/hledger/releases/download/$HLEDGER_VERSION/hledger-$platform.tar.gz"
    echo "$sha256  $archive" | shasum -a 256 --check --quiet
    tar -xzf "$archive" -C "$tmp" hledger
    install -m 755 "$tmp/hledger" "$dest/bin/hledger"
fi

if [ ! -f "$dest/src/VERSION" ] || [ "$(cat "$dest/src/VERSION")" != "$HLEDGER_VERSION" ]; then
    echo "Downloading hledger $HLEDGER_VERSION example files..."
    rm -rf "$dest/src"
    mkdir -p "$dest/src"
    curl -fsSL "https://codeload.github.com/simonmichael/hledger/tar.gz/refs/tags/$HLEDGER_VERSION" |
        tar -xz -C "$dest/src" --strip-components=1 \
            "hledger-$HLEDGER_VERSION/examples" "hledger-$HLEDGER_VERSION/hledger/test"
    echo "$HLEDGER_VERSION" > "$dest/src/VERSION"
fi

"$dest/bin/hledger" --version
