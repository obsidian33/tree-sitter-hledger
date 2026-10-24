; Colours follow hledger-lsp's semantic tokens where it has them: accounts as
; namespaces, commodities as types, payees as functions, tags as attributes.

[
  (comment)
  (comment_text)
  (comment_block)
] @comment @spell

; Outline headings

(heading) @markup.heading

((heading
  marker: (heading_marker) @_marker) @markup.heading.1
  (#lua-match? @_marker "^%*%s"))

((heading
  marker: (heading_marker) @_marker) @markup.heading.2
  (#lua-match? @_marker "^%*%*%s"))

((heading
  marker: (heading_marker) @_marker) @markup.heading.3
  (#lua-match? @_marker "^%*%*%*%s"))

((heading
  marker: (heading_marker) @_marker) @markup.heading.4
  (#lua-match? @_marker "^%*%*%*%*%s"))

((heading
  marker: (heading_marker) @_marker) @markup.heading.5
  (#lua-match? @_marker "^%*%*%*%*%*%s"))

((heading
  marker: (heading_marker) @_marker) @markup.heading.6
  (#lua-match? @_marker "^%*%*%*%*%*%*%s"))

; Transactions

[
  (date)
  (time)
  (posting_date)
] @string.special

(status) @operator

(code) @label

(description) @function

(payee) @function

(note) @string

(description
  "|" @punctuation.delimiter)

(transaction
  "=" @operator)

(periodic_transaction
  "~" @keyword.repeat)

(period_expression) @keyword.repeat

(auto_posting_rule
  "=" @keyword.conditional)

(query) @string.regexp

; Accounts and amounts

(account) @module

; Virtual postings
((account) @module.builtin
  (#lua-match? @module.builtin "^%(.*%)$"))

((account) @module.builtin
  (#lua-match? @module.builtin "^%[.*%]$"))

(commodity) @type

[
  (number)
  (sign)
] @number

[
  (multiplier)
  (cost_marker)
  (assertion_marker)
] @operator

(lot_cost
  [
    "{"
    "}"
  ] @punctuation.bracket)

(lot_date
  [
    "["
    "]"
  ] @punctuation.bracket)

[
  (lot_note)
  (valuation_expression)
] @string.special

; Tags inside comments

(tag
  name: (tag_name) @attribute)

(tag
  value: (tag_value) @string)

(tag
  [
    ":"
    ","
  ] @punctuation.delimiter)

; Directives

[
  "account"
  "alias"
  "apply account"
  "apply year"
  "commodity"
  "decimal-mark"
  "end aliases"
  "end apply account"
  "end tag"
  "format"
  "payee"
  "tag"
  "year"
  "C"
  "D"
  "N"
  "P"
  "Y"
] @keyword.directive

"include" @keyword.import

(ignored_directive) @comment

(path) @string.special.path

(regex) @string.regexp

(alias_directive
  "=" @operator)

(decimal_mark) @character.special

(year) @number

(tag_directive
  name: (tag_name) @attribute)

(subdirective) @comment
