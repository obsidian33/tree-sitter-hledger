; Account alias patterns are POSIX extended regular expressions; the regex
; parser is close enough for highlighting.
((regex) @injection.content
  (#offset! @injection.content 0 1 0 -1)
  (#set! injection.language "regex"))

([
  (comment)
  (comment_block)
] @injection.content
  (#set! injection.language "comment"))
