#!/usr/bin/env python3
"""Checks that hledger accepts every test input in the rules grammar's corpus.

A grammar test only proves the parser produces the expected tree. This makes
sure the input is something hledger itself accepts, so the grammar can't drift
into accepting a different language. Tests marked `:error` are expected to be
rejected by both.

Usage: validate-corpus.py [HLEDGER]  (default: .hledger/bin/hledger)
"""

import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CORPUS = ROOT / "rules" / "test" / "corpus"

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


def hledger_accepts(hledger, rules_text):
    """Returns (accepted, message) for rules_text applied to an empty CSV."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        (tmp / "data.csv").write_text("")
        rules = tmp / "test.rules"
        rules.write_text(rules_text)
        # hledger reads included files while parsing, so they must exist
        for match in re.finditer(r"^include (.+)$", rules_text, re.M):
            included = tmp / match.group(1).strip()
            included.parent.mkdir(parents=True, exist_ok=True)
            included.touch()
        result = subprocess.run(
            [hledger, "-n", "-f", str(tmp / "data.csv"), "--rules", str(rules), "print"],
            capture_output=True,
            text=True,
            cwd=tmp,
        )
        message = result.stderr.strip()
        accepted = result.returncode == 0 or VALIDATION_ONLY in message
        return accepted, message


def main():
    hledger = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / ".hledger" / "bin" / "hledger")
    if not Path(hledger).exists():
        sys.exit(f"{hledger} not found; run `just fetch-hledger` first")

    failures = 0
    count = 0
    for path in sorted(CORPUS.glob("*.txt")):
        for name, attributes, text in parse_corpus(path):
            count += 1
            accepted, message = hledger_accepts(hledger, text)
            expect_error = ":error" in attributes
            if accepted == expect_error:
                failures += 1
                expected = "reject" if expect_error else "accept"
                print(f"FAIL {path.name}: {name} (hledger should {expected} it)")
                if message:
                    print("  " + message.replace("\n", "\n  "))

    print(f"{count - failures}/{count} corpus inputs agree with hledger")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
