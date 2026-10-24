#!/usr/bin/env python3
"""Checks that hledger accepts every test input in a grammar's corpus.

A grammar test only proves the parser produces the expected tree. This makes
sure the input is something hledger itself accepts, so the grammar can't drift
into accepting a different language. Tests marked `:error` are expected to be
rejected by both.

Usage: validate-corpus.py rules|journal [HLEDGER]  (default: .hledger/bin/hledger)
"""

import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# hledger checks one thing after parsing: that the date field is assigned.
# Snippets often leave it out, and that isn't a syntax error.
VALIDATION_ONLY = "Please specify (at top level) the date field"

HEADER = re.compile(r"^={3,}\s*$")
DIVIDER = re.compile(r"^-{3,}\s*$")


def parse_corpus(path):
    """Yields (name, attributes, input) for each test in a corpus file."""
    lines = path.read_text().split("\n")
    i = 0
    while i < len(lines):
        if not HEADER.match(lines[i]):
            i += 1
            continue
        name = lines[i + 1].strip()
        i += 2
        attributes = []
        while not HEADER.match(lines[i]):
            if lines[i].startswith(":"):
                attributes.append(lines[i].strip())
            i += 1
        i += 1
        body = []
        while not DIVIDER.match(lines[i]):
            body.append(lines[i])
            i += 1
        # tree-sitter drops the newline before the divider line
        yield name, attributes, "\n".join(body)


def hledger_accepts(hledger, grammar, text):
    """Returns (accepted, message) for a rules file applied to an empty CSV, or
    for a journal file."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        # hledger reads included files while parsing, so they must exist
        for match in re.finditer(r"^!?include[ \t]+([^;\n]+)", text, re.M):
            target = match.group(1).strip()
            if ":" in target:  # a format prefix like timedot:
                target = target.split(":", 1)[1]
            included = tmp / target.replace("*", "x")
            included.parent.mkdir(parents=True, exist_ok=True)
            included.touch()
        if grammar == "rules":
            (tmp / "data.csv").write_text("")
            (tmp / "test.rules").write_text(text)
            command = [hledger, "-n", "-f", "data.csv", "--rules", "test.rules", "print"]
        else:
            (tmp / "test.journal").write_text(text)
            command = [hledger, "-n", "-f", "test.journal", "print"]
        result = subprocess.run(command, capture_output=True, text=True, cwd=tmp)
        message = result.stderr.strip()
        accepted = result.returncode == 0 or (grammar == "rules" and VALIDATION_ONLY in message)
        return accepted, message


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("rules", "journal"):
        sys.exit("usage: validate-corpus.py rules|journal [HLEDGER]")
    grammar = sys.argv[1]
    hledger = sys.argv[2] if len(sys.argv) > 2 else str(ROOT / ".hledger" / "bin" / "hledger")
    if not Path(hledger).exists():
        sys.exit(f"{hledger} not found; run `just fetch-hledger` first")

    failures = 0
    count = 0
    for path in sorted((ROOT / grammar / "test" / "corpus").glob("*.txt")):
        for name, attributes, text in parse_corpus(path):
            count += 1
            accepted, message = hledger_accepts(hledger, grammar, text)
            expect_error = ":error" in attributes
            if accepted == expect_error:
                failures += 1
                expected = "reject" if expect_error else "accept"
                print(f"FAIL {path.name}: {name} (hledger should {expected} it)")
                if message:
                    print("  " + message.replace("\n", "\n  "))

    print(f"{count - failures}/{count} {grammar} corpus inputs agree with hledger")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
