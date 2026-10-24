// External scanner for the hledger journal grammar.
//
// - _eof: the end of the file, after any trailing spaces, so the last line may
//   have no newline.
// - comment_block: a `comment` line through the next `end comment` line, or
//   to the end of the file. The lines in between can be anything, which a
//   grammar can't express without also matching the `end comment` line.

#include "tree_sitter/parser.h"

#include <stdbool.h>

enum TokenType { END_OF_FILE, COMMENT_BLOCK };

static void advance(TSLexer *lexer) { lexer->advance(lexer, false); }

// Whitespace other than newlines, as hledger (Haskell's isSpace) sees it
static bool is_blank(int32_t c) {
    return c == ' ' || c == '\t' || c == '\f' || c == '\v' || c == 0x00A0 || c == 0x1680 ||
           (c >= 0x2000 && c <= 0x200A) || c == 0x202F || c == 0x205F || c == 0x3000;
}

static bool match_word(TSLexer *lexer, const char *word) {
    for (const char *c = word; *c; c++) {
        if (lexer->lookahead != *c) {
            return false;
        }
        advance(lexer);
    }
    return true;
}

static void skip_blanks(TSLexer *lexer) {
    while (is_blank(lexer->lookahead)) {
        advance(lexer);
    }
}

static void skip_to_next_line(TSLexer *lexer) {
    while (!lexer->eof(lexer) && lexer->lookahead != '\n') {
        advance(lexer);
    }
    if (lexer->lookahead == '\n') {
        advance(lexer);
    }
}

// Consumes the rest of a line that must contain only blanks, and its newline.
static bool blank_rest_of_line(TSLexer *lexer) {
    skip_blanks(lexer);
    if (lexer->lookahead == '\r') {
        advance(lexer);
    }
    if (lexer->lookahead == '\n') {
        advance(lexer);
        return true;
    }
    return lexer->eof(lexer);
}

static bool scan_comment_block(TSLexer *lexer) {
    if (lexer->get_column(lexer) != 0 || !match_word(lexer, "comment")) {
        return false;
    }
    // hledger requires the opening line to be just `comment`
    skip_blanks(lexer);
    if (lexer->lookahead == '\r') {
        advance(lexer);
    }
    if (lexer->lookahead != '\n') {
        return false;
    }
    advance(lexer);

    while (!lexer->eof(lexer)) {
        if (match_word(lexer, "end comment") && blank_rest_of_line(lexer)) {
            break;
        }
        skip_to_next_line(lexer);
    }
    lexer->mark_end(lexer);
    lexer->result_symbol = COMMENT_BLOCK;
    return true;
}

void *tree_sitter_hledger_external_scanner_create(void) { return NULL; }

void tree_sitter_hledger_external_scanner_destroy(void *payload) {}

unsigned tree_sitter_hledger_external_scanner_serialize(void *payload, char *buffer) {
    return 0;
}

void tree_sitter_hledger_external_scanner_deserialize(void *payload, const char *buffer,
                                                      unsigned length) {}

bool tree_sitter_hledger_external_scanner_scan(void *payload, TSLexer *lexer,
                                               const bool *valid_symbols) {
    // During error recovery every symbol is valid; only look for the end of
    // the file then, so recovery doesn't swallow text into a comment block.
    if (valid_symbols[END_OF_FILE] && valid_symbols[COMMENT_BLOCK]) {
        skip_blanks(lexer);
        if (lexer->eof(lexer)) {
            lexer->result_symbol = END_OF_FILE;
            return true;
        }
        return false;
    }

    if (valid_symbols[END_OF_FILE]) {
        skip_blanks(lexer);
        if (lexer->eof(lexer)) {
            lexer->result_symbol = END_OF_FILE;
            return true;
        }
        return false;
    }

    if (valid_symbols[COMMENT_BLOCK]) {
        return scan_comment_block(lexer);
    }

    return false;
}
