; Captures for nvim-treesitter-textobjects. A quantified capture like
; `(posting)+ @function.inner` covers all the matched nodes.

; Transactions behave like functions: `am`/`im`, `]m`/`[m`. The inner part is
; the postings.
([
  (transaction)
  (periodic_transaction)
  (auto_posting_rule)
] @function.outer)

(transaction
  (posting)+ @function.inner)

(periodic_transaction
  (posting)+ @function.inner)

(auto_posting_rule
  (posting)+ @function.inner)

; Sections behave like classes: `ac`/`ic`, `]]`/`[[`
(section
  [
    (comment)
    (comment_block)
    (transaction)
    (periodic_transaction)
    (auto_posting_rule)
    (account_directive)
    (alias_directive)
    (apply_account_directive)
    (commodity_directive)
    (decimal_mark_directive)
    (default_commodity_directive)
    (default_year_directive)
    (end_directive)
    (ignored_directive)
    (include_directive)
    (payee_directive)
    (price_directive)
    (tag_directive)
    (section)
  ]+ @class.inner) @class.outer

; Postings behave like parameters, so they can be selected (`aa`/`ia`) and
; reordered (`]a`/`[a`)
(posting) @parameter.outer @parameter.inner

(amount) @number.inner

[
  (comment)
  (comment_text)
  (comment_block)
] @comment.outer
