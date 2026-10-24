; hledger patterns are POSIX extended regular expressions; the regex parser is
; close enough for highlighting.
((pattern) @injection.content
  (#set! injection.language "regex"))

((command) @injection.content
  (#set! injection.language "bash"))

((comment) @injection.content
  (#set! injection.language "comment"))
