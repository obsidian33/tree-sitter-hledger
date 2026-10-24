#!/usr/bin/env bash
# Usage: check-crlf.sh rules|journal
#
# Checks that CRLF line endings don't change the parse tree. Every file of that
# kind shipped with hledger that parses cleanly is parsed again with CRLF line
# endings. A carriage return sits at the end of its line, so the trees, node
# positions included, must be identical; a difference means a node took in the
# carriage return.
set -euo pipefail

grammar=${1:?usage: check-crlf.sh rules|journal}
root=$(cd "$(dirname "$0")/.." && pwd)
src="$root/.hledger/src"
if [ ! -d "$src" ]; then
    echo "hledger files not found; run \`just fetch-hledger\` first" >&2
    exit 1
fi

case "$grammar" in
    rules) find_args=(-name '*.rules') ;;
    journal) find_args=(\( -name '*.journal' -o -name '*.j' -o -name '*.hledger' \)) ;;
    *)
        echo "unknown grammar: $grammar" >&2
        exit 1
        ;;
esac

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

parse() {
    tree-sitter parse --grammar-path "$root/$grammar" "$1" 2>/dev/null
}

checked=0
differences=0
while IFS= read -r -d '' f; do
    name=${f#"$src"/}
    # Only line endings change; any other carriage return is kept
    perl -pe 's/\r\n/\n/' "$f" > "$tmp/lf"
    perl -pe 's/\n/\r\n/' "$tmp/lf" > "$tmp/crlf"
    lf_tree=$(parse "$tmp/lf") || continue
    checked=$((checked + 1))
    if [ "$lf_tree" != "$(parse "$tmp/crlf" || true)" ]; then
        differences=$((differences + 1))
        echo "CRLF DIFFERS $name"
    fi
done < <(find "$src" "${find_args[@]}" -print0 | sort -z)

echo "$grammar grammar parses $((checked - differences))/$checked files the same with CRLF line endings"
if [ "$checked" -eq 0 ]; then
    echo "no files parsed cleanly; is the grammar or tree-sitter broken?" >&2
    exit 1
fi
[ "$differences" -eq 0 ]
