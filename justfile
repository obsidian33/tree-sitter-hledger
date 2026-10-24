# List recipes
default:
    @just --list

# Regenerate the rules parser from rules/grammar.js
generate:
    cd rules && tree-sitter generate

# Run the rules grammar's corpus tests
test: generate
    cd rules && tree-sitter test

# Accept the current parse trees as the expected output of the corpus tests
update-tests: generate
    cd rules && tree-sitter test --update

# Download the pinned hledger binary and its example files into .hledger/
fetch-hledger:
    scripts/fetch-hledger.sh

# Check that hledger accepts (or rejects) every corpus input the way the tests expect
validate: fetch-hledger
    scripts/validate-corpus.py

# Parse every rules file shipped with hledger
examples: fetch-hledger generate
    scripts/parse-examples.sh

# Everything CI should run
check: test validate examples
