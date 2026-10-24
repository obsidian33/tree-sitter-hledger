// External scanner for the hledger_rules grammar.
//
// Its only job is a zero-width token at the end of the file, so that the last
// line of a rules file parses even when it has no trailing newline.

#include "tree_sitter/parser.h"

enum TokenType { END_OF_FILE };

void *tree_sitter_hledger_rules_external_scanner_create(void) { return NULL; }

void tree_sitter_hledger_rules_external_scanner_destroy(void *payload) {}

unsigned tree_sitter_hledger_rules_external_scanner_serialize(void *payload,
                                                              char *buffer) {
    return 0;
}

void tree_sitter_hledger_rules_external_scanner_deserialize(void *payload,
                                                            const char *buffer,
                                                            unsigned length) {}

bool tree_sitter_hledger_rules_external_scanner_scan(void *payload,
                                                     TSLexer *lexer,
                                                     const bool *valid_symbols) {
    if (valid_symbols[END_OF_FILE] && lexer->eof(lexer)) {
        lexer->result_symbol = END_OF_FILE;
        return true;
    }
    return false;
}
