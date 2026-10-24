# tree-sitter-hledger

[Tree-sitter](https://tree-sitter.github.io) grammars for [hledger](https://hledger.org) files.

| Grammar | Directory | Files |
|---|---|---|
| `hledger` | `journal/` | Journal files (`*.journal`, `*.hledger`, `*.j`) |
| `hledger_rules` | `rules/` | CSV rules files (`*.rules`) |

The grammars follow hledger's own parser, targeting **hledger 1.52.4**, and are
tested against it:

- every test input in the corpus is checked with the real `hledger` binary, which
  must accept it (or reject it, for tests marked `:error`)
- every journal and rules file shipped with hledger (138 journals and 76 rules
  files, examples and test fixtures) must parse cleanly exactly when hledger
  accepts it
- each of those files must parse to the same tree with CRLF line endings, so
  no node's text includes a carriage return

Star comment lines (`* Food`, `** Groceries`) are parsed as nested outline
sections in both grammars, so they can be folded and navigated.

## hledger (journals)

Parses transactions (dates, secondary dates, status, code, `payee | note`
descriptions), postings (status, virtual accounts, amounts, costs, lot
annotations in any order, valuation expressions, the four kinds of balance
assertion, balance assignments), comments with `name: value` tags and
Ledger-style `[DATE]` posting dates, periodic transactions, auto posting rules
with `*` multipliers, comment blocks, and every directive hledger accepts,
including the Ledger directives it ignores.

Amounts follow hledger's number syntax: commodity symbols on either side,
quoted symbols, `.` or `,` decimal marks, digit groups separated by `.`, `,`,
spaces or other Unicode spaces, scientific notation and trailing decimal marks.

Whitespace works as it does in hledger, which counts Unicode spaces (such as
no-break spaces) as whitespace too: account names may contain single spaces
and end at two or more (a tab counts as one space, so `expenses<TAB>$1` is all
account name); a period expression ends at two spaces; a whitespace-only line
ends a transaction; and only indented `;` lines are comments inside a
transaction (an indented `#` line is a posting there). Mistakes hledger rejects
show up as parse errors, such as mixed date separators, no space after a date,
a commodity directive without a decimal mark, or a `*` multiplier outside an
auto posting rule.

Comment lines under a posting continue its comment in hledger. In the tree
they're siblings of the posting, so a posting node covers only the posting's
text.

### Known differences from hledger

- Dates aren't checked for validity (`2024-02-30` parses), nor are alias
  regexes.
- An amount's costs and lot annotations may appear in any order, but hledger
  also allows each at most once; repeats aren't caught.
- Commodity, `D` and `format` directives need a decimal mark in their sample
  amount, but a number with only digit group marks like `1,000,000` isn't
  caught.
- A description can't start with `*`, `!` or `(` (hledger reads those as a
  status mark or code first), even where hledger would allow it, such as after
  a status mark with no space.
- `[DATE]` is recognised in transaction comments too, where hledger treats it as
  text.

## hledger_rules

Parses the whole rules format: directives, `fields` lists, field assignments
(with `%field` and `\1` references), `if` blocks with field matchers and `&&` /
`&` / `!` combinations, `if` tables, `include`, and the `source` directive's data
command.

As in hledger, Unicode spaces (such as no-break spaces) count as whitespace,
except in field names, which end only at a space or tab. Unlike hledger, a
carriage return counts only as part of a line ending, in both grammars.

Some mistakes show up as parse errors, as they would in hledger:

- an indented comment directly after an `if` block (hledger reads every
  indented line after `if` as a rule)
- an empty line between an `if` block's rules (it ends the block)
- a non-numeric `skip` count, or trailing spaces after a `fields` list

### Known differences from hledger

- `if` tables are recognised with these separators only: `, | ; : / ~ ^ + = @`.
  hledger accepts any character that isn't alphanumeric or a space, but a grammar
  can't remember an arbitrary character.
- `if` table rows aren't checked to have one value per header field.
- A table ended by a whitespace-only line is accepted; hledger requires an empty
  line.
- A whole-record matcher can't start with `%` (it's read as a field matcher), and
  a pattern can't end in a single `&`.

## Queries

`journal/queries/` and `rules/queries/` contain Neovim queries: highlights,
folds, injections and
[nvim-treesitter-textobjects](https://github.com/nvim-treesitter/nvim-treesitter-textobjects)
captures.

| Capture | Journal | Rules |
|---|---|---|
| `@function` | transactions, periodic transactions and auto posting rules (inner: their postings) | |
| `@class` | sections | sections |
| `@conditional` | | `if` blocks and tables (inner: their rules or rows) |
| `@parameter` | postings | matchers, `fields` entries, table cells |
| `@comment` | comments | comments |

Journal highlights use the same groups as
[hledger-lsp](https://github.com/juev/hledger-lsp)'s semantic tokens where it has
them (accounts as `@module`, commodities as `@type`, payees as `@function`, tags
as `@attribute`).

The injections highlight comments with the `comment` parser, alias and matcher
patterns with `regex`, and rules files' `source` commands with `bash`; install
those parsers too.

## Neovim

With [nvim-treesitter](https://github.com/nvim-treesitter/nvim-treesitter)'s
`main` branch, register the parsers in a `User TSUpdate` autocommand:

```lua
vim.api.nvim_create_autocmd("User", {
    pattern = "TSUpdate",
    callback = function()
        local parsers = require("nvim-treesitter.parsers")
        for lang, dir in pairs({ hledger = "journal", hledger_rules = "rules" }) do
            parsers[lang] = {
                install_info = {
                    url = "https://github.com/obsidian33/tree-sitter-hledger",
                    location = dir,
                    queries = dir .. "/queries",
                },
            }
        end
    end,
})
```

then `:TSInstall hledger hledger_rules regex bash comment`. Use
`path = "~/path/to/checkout"` instead of `url` to build from a local checkout;
its queries are symlinked, so query edits apply after reopening a buffer
(grammar changes need `:TSInstall!` to rebuild).

The parser names are also the filetypes Neovim needs:

```lua
vim.filetype.add({
    extension = { journal = "hledger", hledger = "hledger", rules = "hledger_rules" },
})
```

## Development

Requires [tree-sitter CLI](https://tree-sitter.github.io/tree-sitter/creating-parsers/1-getting-started.html)
0.27+, [just](https://just.systems), Python 3 and curl.

| Command | |
|---|---|
| `just generate` | Regenerate the parsers from `*/grammar.js` |
| `just test` | Run the corpus tests in `*/test/corpus/` |
| `just update-tests` | Record the current parse trees as the tests' expected output |
| `just validate` | Check every corpus input against hledger |
| `just examples` | Parse every journal and rules file shipped with hledger and compare with hledger's verdict |
| `just crlf` | Check that those files parse the same with CRLF line endings |
| `just check` | All of the above |

`just fetch-hledger` (run automatically by `validate`, `examples` and `crlf`) downloads
the pinned hledger release and its example files into `.hledger/`.

## License

MIT
