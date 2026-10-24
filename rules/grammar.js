/**
 * @file Grammar for hledger CSV rules files (*.rules)
 * @author obsidian33
 * @license MIT
 *
 * Follows hledger 1.52's rules parser (hledger-lib/Hledger/Read/RulesReader.hs).
 * The format is line based and whitespace sensitive: indentation is what
 * separates an if block's matcher lines from its rules, and an empty line (but
 * not a whitespace-only one) ends an if block or if table. So nothing is
 * skipped implicitly; every space is spelled out.
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// hledger accepts any character that is neither alphanumeric nor whitespace as
// an if table's separator. A grammar can't remember an arbitrary character, so
// each separator below gets its own generated set of rules. The characters that
// begin matcher syntax (&, !, %) or comments (#, *) are left out.
const TABLE_SEPARATORS = {
  ',': 'comma',
  '|': 'pipe',
  ';': 'semicolon',
  ':': 'colon',
  '/': 'slash',
  '~': 'tilde',
  '^': 'caret',
  '+': 'plus',
  '=': 'equals',
  '@': 'at',
};

// Star comment lines double as org-style outline headings: `* Food`,
// `** Groceries`. Deeper levels are rare, and each level is its own rule.
const MAX_HEADING_LEVEL = 6;

// hledger's journalfieldnames: accountN, amountN, amountN-in, amountN-out,
// balanceN, commentN and currencyN for N from 1 to 99, plus the unnumbered
// fields. `skip` and `end` are handled separately: `skip` is a directive at the
// top level, and both only take effect inside conditional rules.
const HLEDGER_FIELD =
  /account[1-9][0-9]?|amount([1-9][0-9]?)?(-in|-out)?|balance([1-9][0-9]?)?|comment([1-9][0-9]?)?|currency([1-9][0-9]?)?|code|date2?|description|status/;

const DIRECTIVES = [
  'archive',
  'balance-type',
  'decimal-mark',
  'encoding',
  'intra-day-reversed',
  'newest-first',
  'separator',
  'timezone',
];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

// hledger's rules parser treats any Unicode space as whitespace (Haskell's
// isSpace): space, tab, form feed, vertical tab and the Unicode space
// separators. Field names are the exception: they end only at a space or tab.
// Written as regex escapes for use inside character classes.
const WS = ' \\t\\f\\v\\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000';

/**
 * A regex from a template literal, with backslashes kept as written.
 *
 * @param {TemplateStringsArray} strings
 * @param {...string} values
 */
const re = (strings, ...values) => new RegExp(String.raw(strings, ...values));

export default grammar({
  name: 'hledger_rules',

  extras: (_) => [],

  externals: ($) => [$._eof],

  rules: {
    source_file: ($) => body($, 1),

    // Everything except if blocks and indented comments, which body() places
    _item: ($) =>
      choice(
        $._newline,
        $._whitespace_line,
        $._comment_line,
        $.include,
        $.directive,
        $.fields_list,
        $.field_assignment,
        ...Object.values(TABLE_SEPARATORS).map((name) =>
          alias($[`_if_table_${name}`], $.if_table),
        ),
      ),

    // Outline sections

    ...Object.fromEntries(
      range(1, MAX_HEADING_LEVEL).flatMap((level) => [
        [
          `_section_${level}`,
          ($) =>
            prec.right(
              seq(alias($[`_heading_${level}`], $.heading), body($, level + 1)),
            ),
        ],
        [
          `_heading_${level}`,
          ($) =>
            seq(
              field(
                'marker',
                alias(token(seq('*'.repeat(level), re`[${WS}]+`)), $.heading_marker),
              ),
              optional(field('title', $.heading_title)),
              $._eol,
            ),
        ],
      ]),
    ),

    heading_title: (_) => /[^\n]+/,

    // Comments

    _comment_line: ($) => seq($.comment, $._eol),

    // One to six `*` followed by whitespace is a heading instead. (Repetition
    // is spelled out: tree-sitter's regexes don't support open-ended `{n,}`.)
    comment: (_) =>
      token(
        choice(
          /[;#][^\n]*/,
          re`\*+([^${WS}\n*][^\n]*)?`,
          new RegExp(`${'\\*'.repeat(MAX_HEADING_LEVEL + 1)}\\**[${WS}][^\\n]*`),
        ),
      ),

    _indented_comment_line: ($) =>
      seq(alias(token(re`[${WS}]+[;#*][^\n]*`), $.comment), $._eol),

    // Inside an if table every line starting with ;, # or * is a comment, so a
    // star heading there doesn't start a section. Preferred over a table row
    // that would match the same text.
    _table_comment_line: ($) =>
      seq(alias(token(prec(1, re`[${WS}]*[;#*][^\n]*`)), $.comment), $._eol),

    // include

    // hledger inlines included files before parsing, matching lines that start
    // with "include " (a space, not a tab).
    include: ($) =>
      seq('include', re` [${WS}]*`, field('path', alias(/[^\n]+/, $.path)), $._eol),

    // Directives

    directive: ($) =>
      choice(
        directive($, 'source', $._source_value),
        directive($, 'date-format', $.date_format),
        directive($, 'skip', alias(/[0-9]+/, $.directive_value)),
        ...DIRECTIVES.map((name) => directive($, name, $.directive_value)),
      ),

    directive_value: (_) => /[^\n]+/,

    // A # before the | comments out the rest of the line; after the | it
    // belongs to the shell command.
    _source_value: ($) =>
      choice(
        seq(
          field('path', alias(/[^#|\n]+/, $.path)),
          optional(choice($._source_comment, $._source_command)),
        ),
        $._source_comment,
        $._source_command,
      ),

    _source_comment: ($) => alias(/#[^\n]*/, $.comment),

    _source_command: ($) =>
      seq('|', optional(field('command', alias(/[^\n]+/, $.command)))),

    date_format: ($) =>
      repeat1(choice($.format_specifier, alias(/[^%\n]+/, $.text), alias('%', $.text))),

    // strftime-style conversions, eg %d, %-m, %Y, %Ez
    format_specifier: (_) => /%[-_0^#]?[0-9]*[EO]?[a-zA-Z%]/,

    // fields list

    fields_list: ($) =>
      seq(
        'fields',
        optional(':'),
        $._ws,
        optional($.field_name),
        // A space or tab before the comma; a Unicode space there would be part of
        // the field name
        repeat1(seq(re`[ \t]*,[${WS}]*`, optional($.field_name))),
        $._eol,
      ),

    field_name: (_) =>
      token(choice(/"[^"\n:;#~]+"/, /[^ \t\n,;#~"][^ \t\n,;#~]*/)),

    // Field assignments

    // `end` is accepted at the top level too, though it only does something in
    // conditional rules.
    field_assignment: ($) =>
      seq(
        field('name', choice($.hledger_field, alias('end', $.hledger_field))),
        optional($._assignment_value),
        $._eol,
      ),

    _assignment_value: ($) =>
      seq($._assignment_separator, optional(field('value', $.value))),

    _assignment_separator: ($) => choice($._ws, re`[${WS}]*:[${WS}]*`),

    hledger_field: (_) => HLEDGER_FIELD,

    value: ($) =>
      repeat1(choice($.field_reference, $.match_group_reference, $._value_text)),

    field_reference: (_) => /%[\p{L}\p{N}_-]+/,

    match_group_reference: (_) => /\\[0-9]+/,

    // Text other than field and match group references; a % or \ that doesn't
    // start one is literal.
    _value_text: (_) =>
      token(
        choice(/([^%\\\n]|%[^\p{L}\p{N}_\-\n]|\\[^0-9\n])+/, '%', '\\'),
      ),

    // if blocks

    // `if MATCHER` or `if` followed by matchers on the following lines, then
    // indented rules. Matcher lines are never indented, so the first indented
    // line starts the rules. Whitespace-only lines may appear among the rules;
    // an empty line ends the block.
    if_block: ($) =>
      prec.right(
        seq(
          'if',
          choice($._newline, seq($._ws, optional($._newline))),
          repeat1($._matcher_line),
          repeat($._whitespace_line),
          $._rule_line,
          repeat(choice($._rule_line, $._whitespace_line)),
        ),
      ),

    _matcher_line: ($) => seq(repeat1($.matcher), $._eol),

    // Matchers on one line are joined by `&&`, which begins the next matcher's
    // prefix. The pattern runs to the end of the line or the next `&&`.
    matcher: ($) =>
      seq(
        optional(field('prefix', $.matcher_prefix)),
        optional(seq(field('field', $._matcher_field), optional($._ws))),
        field('pattern', $.pattern),
      ),

    matcher_prefix: ($) =>
      choice(
        seq(choice('&&', '&'), optional($._ws), optional(seq('!', optional($._ws)))),
        seq('!', optional($._ws)),
      ),

    // A matcher's field reference is any field name, quoted or bare, unlike the
    // narrower references allowed in values.
    _matcher_field: ($) =>
      alias(
        token(/%("[^"\n:;#~]+"|[^ \t\n,;#~"][^ \t\n,;#~]*)/),
        $.field_reference,
      ),

    pattern: (_) => token(seq(re`[^${WS}\n&!%]`, /([^&\n]|&[^&\n])*/)),

    _rule_line: ($) =>
      seq($._ws, alias($._conditional_rule, $.field_assignment), $._eol),

    _conditional_rule: ($) =>
      seq(
        field(
          'name',
          choice($.hledger_field, alias(choice('skip', 'end'), $.hledger_field)),
        ),
        optional($._assignment_value),
      ),

    // if tables

    ...Object.fromEntries(
      Object.entries(TABLE_SEPARATORS).flatMap(([sep, name]) =>
        ifTableRules(sep, name),
      ),
    ),

    // Lines

    _ws: (_) => re`[${WS}]+`,

    _whitespace_line: ($) => choice(re`[${WS}]+\r?\n`, seq($._ws, $._eof)),

    _newline: (_) => /\r?\n/,

    // The last line of a file may have no newline.
    _eol: ($) => choice($._newline, $._eof),
  },
});

/**
 * @param {number} from
 * @param {number} to
 * @returns {number[]}
 */
function range(from, to) {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/**
 * The contents of the file, or of a section whose subsections are at `level`.
 *
 * hledger reads every indented line after an if block as one of its rules, so
 * an indented comment directly after an if block is a parse error there. Any
 * other line ends a run of if blocks, after which indented comments are fine.
 *
 * @param {GrammarSymbols<string>} $
 * @param {number} level
 * @returns {RuleOrLiteral}
 */
function body($, level) {
  const other = choice($._item, ...sections($, level));
  return seq(
    repeat(choice(other, $._indented_comment_line, seq(repeat1($.if_block), other))),
    repeat($.if_block),
  );
}

/**
 * Sections at `level` and deeper, which can appear at the current position.
 *
 * @param {GrammarSymbols<string>} $
 * @param {number} level
 * @returns {RuleOrLiteral[]}
 */
function sections($, level) {
  return range(level, MAX_HEADING_LEVEL).map((l) => alias($[`_section_${l}`], $.section));
}

/**
 * @param {GrammarSymbols<string>} $
 * @param {string} name
 * @param {RuleOrLiteral} value
 * @returns {RuleOrLiteral}
 */
function directive($, name, value) {
  return seq(
    field('name', alias(name, $.directive_name)),
    optional(seq($._assignment_separator, optional(field('value', value)))),
    $._eol,
  );
}

/**
 * Rules for an if table whose cells are separated by `sep`:
 *
 *     if,account2,comment
 *     whole foods,expenses:groceries,
 *     %description coffee && %amount 5,expenses:coffee,morning
 *
 * The header lists hledger fields with no spaces; each row holds matchers up to
 * the first separator, then one value per field. A table ends at an empty line
 * or the end of the file.
 *
 * @param {string} sep
 * @param {string} name
 * @returns {[string, ($: GrammarSymbols<string>) => RuleOrLiteral][]}
 */
function ifTableRules(sep, name) {
  const s = escapeRegex(sep);
  const tableField = ($) =>
    choice($.hledger_field, alias(choice('skip', 'end'), $.hledger_field));
  const cell = ($) => alias($[`_table_value_${name}`], $.value);

  return [
    [
      `_if_table_${name}`,
      ($) =>
        prec.right(
          seq(
            'if',
            sep,
            field('field', tableField($)),
            repeat(seq(sep, field('field', tableField($)))),
            $._newline,
            repeat1(choice($._table_comment_line, alias($[`_table_row_${name}`], $.table_row))),
          ),
        ),
    ],
    [
      `_table_row_${name}`,
      ($) =>
        seq(
          repeat1(alias($[`_table_matcher_${name}`], $.matcher)),
          sep,
          optional(cell($)),
          repeat(seq(sep, optional(cell($)))),
          $._eol,
        ),
    ],
    [
      `_table_matcher_${name}`,
      ($) =>
        seq(
          optional(field('prefix', $.matcher_prefix)),
          optional(
            seq(
              field(
                'field',
                alias(
                  token(new RegExp(`%("[^"\\n:;#~${s}]+"|[^ \\t\\n,;#~"${s}][^ \\t\\n,;#~${s}]*)`)),
                  $.field_reference,
                ),
              ),
              optional($._ws),
            ),
          ),
          field(
            'pattern',
            alias(
              token(seq(new RegExp(`[^${WS}\\n&!%${s}]`), new RegExp(`([^&\\n${s}]|&[^&\\n${s}])*`))),
              $.pattern,
            ),
          ),
        ),
    ],
    [
      `_table_value_${name}`,
      ($) =>
        repeat1(
          choice(
            $.field_reference,
            $.match_group_reference,
            token(
              choice(
                new RegExp(`([^%\\\\\\n${s}]|%[^\\p{L}\\p{N}_\\-\\n${s}]|\\\\[^0-9\\n${s}])+`),
                '%',
                '\\',
              ),
            ),
          ),
        ),
    ],
  ];
}
