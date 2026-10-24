(comment) @comment @spell

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
; Keywords

(directive_name) @keyword.directive

"include" @keyword.import

"if" @keyword.conditional

"fields" @keyword

; Fields

(hledger_field) @property

(field_name) @variable

; A fields list entry named like a hledger field also assigns to it. Written in
; vim's magic regex syntax, whose escapes the tree-sitter CLI also compiles.
((field_name) @property
  (#match? @property "^\"\\?\\(account[1-9][0-9]\\?\\|amount\\([1-9][0-9]\\?\\)\\?\\(-in\\|-out\\)\\?\\|balance\\([1-9][0-9]\\?\\)\\?\\|comment\\([1-9][0-9]\\?\\)\\?\\|currency\\([1-9][0-9]\\?\\)\\?\\|code\\|date2\\?\\|description\\|status\\|skip\\|end\\)\"\\?$"))

; Values

(value) @string

(directive_value) @string

; Account and amount values get the same highlights as in journals
(field_assignment
  name: (hledger_field) @_name
  value: (value) @variable.member
  (#lua-match? @_name "^account"))

(field_assignment
  name: (hledger_field) @_name
  value: (value) @number
  (#lua-match? @_name "^amount"))

(field_assignment
  name: (hledger_field) @_name
  value: (value) @number
  (#lua-match? @_name "^balance"))

(field_reference) @variable.parameter

(match_group_reference) @string.special

(date_format
  (text) @string)

(format_specifier) @character.special

(path) @string.special.path

(command) @string

; Matchers

(pattern) @string.regexp

(matcher_prefix
  [
    "&"
    "&&"
    "!"
  ] @operator)

; Punctuation

(fields_list
  ":" @punctuation.delimiter)

(directive
  "|" @punctuation.special)

(if_table
  [
    ","
    "|"
    ";"
    ":"
    "/"
    "~"
    "^"
    "+"
    "="
    "@"
  ] @punctuation.delimiter)

(table_row
  [
    ","
    "|"
    ";"
    ":"
    "/"
    "~"
    "^"
    "+"
    "="
    "@"
  ] @punctuation.delimiter)
