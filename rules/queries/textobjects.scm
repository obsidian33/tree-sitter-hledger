; Captures for nvim-treesitter-textobjects

; A quantified capture like `(table_row)+ @conditional.inner` covers all the
; matched nodes. The `.` anchor doesn't work here because the grammar groups
; lines into hidden nodes, so inner ranges list the node types they cover.

; Sections behave like classes: `ac`/`ic`, `]]`/`[[`
(section
  [
    (comment)
    (include)
    (directive)
    (fields_list)
    (field_assignment)
    (if_block)
    (if_table)
    (section)
  ]+ @class.inner) @class.outer

; if blocks and tables behave like conditionals: `ai`/`ii`, `]i`/`[i`.
; The inner part is an if block's rules or an if table's rows.
(if_block
  (field_assignment)+ @conditional.inner) @conditional.outer

(if_table
  [
    (table_row)
    (comment)
  ]+ @conditional.inner) @conditional.outer

; Matchers, fields list entries and table cells behave like parameters, so they
; can be selected (`aa`/`ia`) and reordered (`]a`/`[a`)
(matcher) @parameter.outer @parameter.inner

(fields_list
  (field_name) @parameter.outer @parameter.inner)

(table_row
  (value) @parameter.outer @parameter.inner)

(field_assignment) @assignment.outer

(field_assignment
  name: (_) @assignment.lhs
  value: (_) @assignment.rhs @assignment.inner)

(comment) @comment.outer
