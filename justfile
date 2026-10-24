grammars := "journal rules"

# List recipes
default:
    @just --list

# Regenerate the parsers from */grammar.js
generate:
    for g in {{ grammars }}; do (cd $g && tree-sitter generate); done

# Run the corpus tests of both grammars
test: generate
    for g in {{ grammars }}; do (cd $g && tree-sitter test); done

# Accept the current parse trees as the expected output of the corpus tests
update-tests: generate
    for g in {{ grammars }}; do (cd $g && tree-sitter test --update --show-fields); done

# Download the pinned hledger binary and its example files into .hledger/
fetch-hledger:
    scripts/fetch-hledger.sh

# Check that hledger accepts (or rejects) every corpus input the way the tests expect
validate: fetch-hledger
    for g in {{ grammars }}; do scripts/validate-corpus.py $g; done

# Parse every journal and rules file shipped with hledger and compare with hledger's verdict
examples: fetch-hledger generate
    for g in {{ grammars }}; do scripts/parse-examples.sh $g; done

# Everything CI should run
check: test validate examples
