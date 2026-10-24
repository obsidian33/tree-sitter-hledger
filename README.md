# tree-sitter-hledger

[Tree-sitter](https://tree-sitter.github.io) grammars for [hledger](https://hledger.org) files.

| Grammar | Files | Status |
|---|---|---|
| `hledger_rules` (`rules/`) | CSV rules files (`*.rules`) | Usable |
| `hledger` | Journal files | Planned |

The grammars follow hledger's own parser, targeting **hledger 1.52.4**, and are
tested against it:

- every test input in the corpus is checked with the real `hledger` binary, which
  must accept it (or reject it, for tests marked `:error`)
- every rules file shipped with hledger (76 examples and test fixtures) must parse
  cleanly exactly when hledger accepts it

## hledger_rules

Parses the whole rules format: directives, `fields` lists, field assignments
(with `%field` and `\1` references), `if` blocks with field matchers and `&&` /
`&` / `!` combinations, `if` tables, `include`, and the `source` directive's data
command.

Star comment lines (`* Food`, `** Groceries`) are parsed as nested outline
sections, so they can be folded and navigated.

Being faithful to hledger means some mistakes show up as parse errors, as they
would in hledger:

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

### Queries

`rules/queries/` contains Neovim queries: highlights, folds (sections, `if`
blocks, `if` tables), injections and
[nvim-treesitter-textobjects](https://github.com/nvim-treesitter/nvim-treesitter-textobjects)
captures (sections as `@class`, `if` blocks and tables as `@conditional`,
matchers, `fields` entries and table cells as `@parameter`).

The injections highlight matcher patterns with the `regex` parser, `source`
commands with `bash`, and comments with `comment`; install those parsers too.

## Neovim

With [nvim-treesitter](https://github.com/nvim-treesitter/nvim-treesitter)'s
`main` branch, register the parser in a `User TSUpdate` autocommand:

```lua
vim.api.nvim_create_autocmd("User", {
    pattern = "TSUpdate",
    callback = function()
        require("nvim-treesitter.parsers").hledger_rules = {
            install_info = {
                url = "https://github.com/obsidian33/tree-sitter-hledger",
                location = "rules",
                queries = "rules/queries",
            },
        }
    end,
})
```

then `:TSInstall hledger_rules regex bash comment`. Use `path = "~/path/to/checkout"`
instead of `url` to build from a local checkout; its queries are symlinked, so
edits apply after reopening a buffer.

Neovim needs to know the `hledger_rules` filetype:

```lua
vim.filetype.add({ extension = { rules = "hledger_rules" } })
```

## Development

Requires [tree-sitter CLI](https://tree-sitter.github.io/tree-sitter/creating-parsers/1-getting-started.html)
0.27+, [just](https://just.systems), Python 3 and curl.

| Command | |
|---|---|
| `just generate` | Regenerate the parser from `rules/grammar.js` |
| `just test` | Run the corpus tests in `rules/test/corpus/` |
| `just update-tests` | Record the current parse trees as the tests' expected output |
| `just validate` | Check every corpus input against hledger |
| `just examples` | Parse every rules file shipped with hledger and compare with hledger's verdict |
| `just check` | All of the above |

`just fetch-hledger` (run automatically by `validate` and `examples`) downloads
the pinned hledger release and its example files into `.hledger/`.

## License

MIT
