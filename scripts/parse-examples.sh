#!/usr/bin/env bash
# Parses every rules file shipped with hledger (examples and tests) and checks
# that the grammar agrees with hledger about each one: files hledger accepts
# must parse cleanly, and files it rejects must contain a parse error. (A few
# of hledger's own files are deliberately invalid or use removed syntax.)
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
src="$root/.hledger/src"
hledger="$root/.hledger/bin/hledger"
if [ ! -d "$src" ] || [ ! -x "$hledger" ]; then
    echo "hledger files not found; run \`just fetch-hledger\` first" >&2
    exit 1
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
: > "$tmp/empty.csv"

# hledger checks one thing after parsing: that the date field is assigned.
validation_only="Please specify (at top level) the date field"

# Files hledger rejects for reasons a grammar can't express
known_difference() {
    case "$1" in
        hledger/test/errors/csviftablevaluecount.csv.rules)
            echo "if table rows must have one value per header field; a grammar can't count them"
            ;;
        *) return 1 ;;
    esac
}

run_hledger() {
    # Run from the file's directory so relative includes resolve.
    (cd "$(dirname "$1")" && "$hledger" -n -f "$tmp/empty.csv" --rules "$(basename "$1")" print 2>&1)
}

# Some examples include shared rules files that aren't in hledger's repository.
# Those fail on the missing file rather than on their own syntax, so check a
# copy with the missing files stubbed out as empty.
hledger_accepts() {
    local file=$1 out missing copy attempt
    for attempt in 1 2 3 4 5; do
        if out=$(run_hledger "$file"); then
            return 0
        fi
        [[ "$out" == *"$validation_only"* ]] && return 0
        missing=$(sed -nE 's/^hledger: Error: (.+): openFile: does not exist.*/\1/p' <<<"$out")
        [ -z "$missing" ] && return 1
        if [ -z "${copy:-}" ]; then
            copy="$tmp/copy-$attempt"
            cp -R "$(dirname "$file")" "$copy"
            file="$copy/$(basename "$file")"
        fi
        mkdir -p "$(dirname "$copy/$missing")"
        touch "$copy/$missing"
    done
    return 1
}

files=()
while IFS= read -r -d '' f; do
    files+=("$f")
done < <(find "$src" -name '*.rules' -print0 | sort -z)

disagreements=0
rejected=0
for f in "${files[@]}"; do
    name=${f#"$src"/}
    if tree-sitter parse --quiet --grammar-path "$root/rules" "$f" >/dev/null 2>&1; then
        parses=yes
    else
        parses=no
    fi
    if hledger_accepts "$f"; then
        accepted=yes
    else
        accepted=no
        rejected=$((rejected + 1))
    fi
    if [ "$parses" != "$accepted" ]; then
        if reason=$(known_difference "$name"); then
            echo "KNOWN       $name: $reason"
            continue
        fi
        disagreements=$((disagreements + 1))
        if [ "$accepted" = yes ]; then
            echo "PARSE ERROR $name (hledger accepts it)"
        else
            echo "NO ERROR    $name (hledger rejects it)"
        fi
    fi
done

echo "grammar agrees with hledger on $(( ${#files[@]} - disagreements ))/${#files[@]} rules files ($rejected rejected by hledger)"
[ "$disagreements" -eq 0 ]
