#!/usr/bin/env bash
# Usage: parse-examples.sh rules|journal
#
# Parses every file of that kind shipped with hledger (examples and tests) and
# checks that the grammar agrees with hledger about each one: files hledger can
# parse must parse cleanly, and files it can't must contain a parse error. (A
# few of hledger's own files are deliberately invalid or use removed syntax.)
set -euo pipefail

grammar=${1:?usage: parse-examples.sh rules|journal}
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

case "$grammar" in
    rules)
        find_args=(-name '*.rules')
        # hledger checks one thing after parsing rules: that the date field is
        # assigned.
        not_syntax='Please specify \(at top level\) the date field'
        ;;
    journal)
        find_args=(\( -name '*.journal' -o -name '*.j' -o -name '*.hledger' \))
        # Errors hledger reports after parsing (balancing, assertions), in
        # files it includes, or about values the grammar accepts as text
        not_syntax='unbalanced|could not balance|balance assertion|in file included from|This is not a valid date|partial date can not be parsed|invalid account type code|should be the same|more than 255 decimal places'
        ;;
    *)
        echo "unknown grammar: $grammar" >&2
        exit 1
        ;;
esac

# Files hledger rejects for reasons a grammar can't express
known_difference() {
    case "$1" in
        hledger/test/errors/csviftablevaluecount.csv.rules)
            echo "if table rows must have one value per header field; a grammar can't count them"
            ;;
        hledger/test/errors/parseable-regexps.j)
            echo "alias regexes aren't checked for validity"
            ;;
        *) return 1 ;;
    esac
}

run_hledger() {
    # Run from the file's directory so relative includes resolve.
    local dir file
    dir=$(dirname "$1")
    file=$(basename "$1")
    if [ "$grammar" = rules ]; then
        (cd "$dir" && "$hledger" -n -f "$tmp/empty.csv" --rules "$file" print 2>&1)
    else
        (cd "$dir" && "$hledger" -n -f "$file" print -I 2>&1)
    fi
}

# Some files include others that aren't in hledger's repository. Those fail on
# the missing file rather than on their own syntax, so check a copy with the
# missing files stubbed out as empty.
hledger_accepts() {
    local file=$1 out missing copy="" attempt
    for attempt in $(seq 1 50); do
        if out=$(run_hledger "$file"); then
            return 0
        fi
        grep -qiE "$not_syntax" <<<"$out" && return 0
        missing=$(sed -nE -e 's/^hledger: Error: (.+): openFile: does not exist.*/\1/p' \
            -e 's/.*No files were matched by: (.+)$/\1/p' <<<"$out" | head -n 1)
        [ -z "$missing" ] && return 1
        if [ -z "$copy" ]; then
            copy=$(mktemp -d "$tmp/copy.XXXXXX")
            cp -R "$(dirname "$file")/." "$copy"
            file="$copy/$(basename "$file")"
        fi
        case "$missing" in
            /*) return 1 ;; # an absolute path we can't stub
            *[*?[]*) return 0 ;; # a glob matching nothing; the rest is unchecked
        esac
        mkdir -p "$(dirname "$copy/$missing")"
        touch "$copy/$missing"
    done
    return 1
}

files=()
while IFS= read -r -d '' f; do
    files+=("$f")
done < <(find "$src" "${find_args[@]}" -print0 | sort -z)

disagreements=0
rejected=0
for f in "${files[@]}"; do
    name=${f#"$src"/}
    if tree-sitter parse --quiet --grammar-path "$root/$grammar" "$f" >/dev/null 2>&1; then
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

echo "$grammar grammar agrees with hledger on $(( ${#files[@]} - disagreements ))/${#files[@]} files ($rejected rejected by hledger)"
[ "$disagreements" -eq 0 ]
