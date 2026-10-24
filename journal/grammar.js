/**
 * @file Grammar for hledger journal files
 * @author obsidian33
 * @license MIT
 *
 * Follows hledger 1.52's journal parser (hledger-lib/Hledger/Read/JournalReader.hs
 * and Common.hs). Whitespace is significant: postings are indented, account
 * names may contain single spaces and end at two or more, and a whitespace-only
 * line ends a transaction. So nothing is skipped implicitly.
 *
 * Tokens that can follow an amount or account (comments, costs, assertions, the
 * end of the line) include their leading whitespace. Otherwise the parser
 * couldn't tell whether a space after `10` starts a commodity (`10 USD`) or
 * precedes a comment.
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Star comment lines double as org-style outline headings, as in the rules
// grammar.
const MAX_HEADING_LEVEL = 6;

// hledger accepts these as digit group marks besides . and , (space, no-break
// space, en space, em space, punctuation space, thin space, narrow no-break
// space, medium mathematical space).
const GROUP_MARKS = ' \u00A0\u2002\u2003\u2008\u2009\u202F\u205F';

// hledger treats any Unicode space as whitespace (Haskell's isSpace): space,
// tab, form feed, vertical tab and the Unicode space separators. Written as
// regex escapes for use inside character classes.
const WS = ' \\t\\f\\v\\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000';

/**
 * A regex from a template literal, with backslashes kept as written.
 *
 * @param {TemplateStringsArray} strings
 * @param {...string} values
 */
const re = (strings, ...values) => new RegExp(String.raw(strings, ...values));

const DIGITS = '[0-9]+';
const GROUPED = `${DIGITS}([.,${GROUP_MARKS}]${DIGITS})*`;
// hledger rejects an exponent on a number with digit group marks
const EXPONENT = '[eE][+-]?[0-9]+';

// Ledger directives hledger accepts and ignores, along with the rest of their
// line
const IGNORED_DIRECTIVES = [
  'apply fixed',
  'apply tag',
  'end apply fixed',
  'end apply year',
  'assert',
  'capture',
  'check',
  'define',
  'expr',
  'value',
  'eval',
  '--',
  'A ',
  'bucket ',
];

/**
 * A keyword made of several words separated by any amount of whitespace, as
 * hledger's keywordsp allows.
 *
 * @param {string} words
 */
const keywords = (words) =>
  token(seq(...words.split(' ').flatMap((w, i) => (i === 0 ? [w] : [re`[${WS}]+`, w]))));

/**
 * A token that may be preceded by whitespace on the same line.
 *
 * @param {RuleOrLiteral} rule
 */
const spaced = (rule) => token(seq(re`[${WS}]*`, rule));

export default grammar({
  name: 'hledger',

  extras: (_) => [],

  externals: ($) => [$._eof, $.comment_block],

  rules: {
    source_file: ($) => repeat(choice($._item, ...sections($, 1))),

    _item: ($) =>
      choice(
        $._newline,
        $._comment_line,
        $._indented_comment_line,
        $.comment_block,
        $.transaction,
        $.periodic_transaction,
        $.auto_posting_rule,
        $._directive,
      ),

    // Outline sections

    ...Object.fromEntries(
      range(1, MAX_HEADING_LEVEL).flatMap((level) => [
        [
          `_section_${level}`,
          ($) =>
            prec.right(
              seq(
                alias($[`_heading_${level}`], $.heading),
                repeat(choice($._item, ...sections($, level + 1))),
              ),
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

    heading_title: (_) => /[^\r\n]+/,

    // Comment lines

    _comment_line: ($) => seq($.comment, $._eol),

    // A `*` followed by whitespace is a heading instead (up to six of them).
    // Repetition is spelled out: tree-sitter's regexes don't support `{n,}`.
    comment: (_) =>
      token(
        choice(
          /[;#][^\r\n]*/,
          re`\*+([^${WS}\r\n*][^\r\n]*)?`,
          new RegExp(`${'\\*'.repeat(MAX_HEADING_LEVEL + 1)}\\**[${WS}][^\\r\\n]*`),
        ),
      ),

    // Indented comment lines outside transactions and directives. Inside them
    // an indented `;` line continues the previous comment, and other indented
    // lines are postings or subdirectives.
    _indented_comment_line: ($) =>
      seq($._ws, alias(/[;#*][^\r\n]*/, $.comment), $._eol),

    // Transactions

    transaction: ($) =>
      prec.right(
        seq(
          field('date', $.date),
          optional(seq('=', field('secondary_date', $.date))),
          choice($._eol, seq($._ws, $._header, $._eol)),
          repeat(choice($._following_posting_comment, $._posting_line)),
        ),
      ),

    // `~ PERIOD  description`: the period expression ends at two spaces.
    periodic_transaction: ($) =>
      prec.right(
        seq(
          '~',
          optional($._ws),
          field('period', $.period_expression),
          choice($._eol, seq($._ws, $._header, $._eol)),
          repeat(choice($._following_posting_comment, $._posting_line)),
        ),
      ),

    period_expression: (_) => re`[^${WS}\r\n;]+([${WS}][^${WS}\r\n;]+)*`,

    // `= QUERY` followed by postings whose amounts may be `*` multipliers
    auto_posting_rule: ($) =>
      prec.right(
        seq(
          '=',
          optional($._ws),
          optional(field('query', $.query)),
          optional(field('comment', $.comment_text)),
          $._eol,
          repeat(
            choice(
              $._following_posting_comment,
              seq($._ws, alias($._auto_posting, $.posting), $._eol),
            ),
          ),
        ),
      ),

    query: (_) => re`[^${WS};\r\n][^;\r\n]*`,

    // Status, code, description and comment, each optional
    _header: ($) =>
      choice(
        seq(
          field('status', $.status),
          optional($._ws),
          optional($._header_after_status),
        ),
        $._header_after_status,
      ),

    _header_after_status: ($) =>
      choice(
        seq(
          field('code', $.code),
          optional($._ws),
          optional($._header_after_code),
        ),
        $._header_after_code,
      ),

    _header_after_code: ($) =>
      choice(
        seq(
          field('description', $.description),
          optional(field('comment', $.comment_text)),
        ),
        field('comment', $.comment_text),
      ),

    status: (_) => choice('*', '!'),

    code: (_) => /\([^)\r\n]*\)/,

    // `PAYEE | NOTE`, or a description without a payee/note split
    description: ($) =>
      choice(
        $._description_text,
        seq(
          optional(field('payee', alias($._description_text, $.payee))),
          '|',
          optional($._ws),
          optional(field('note', $.note)),
        ),
      ),

    _description_text: (_) => re`[^${WS};|\r\n*!(][^;|\r\n]*`,

    note: (_) => re`[^${WS};\r\n][^;\r\n]*`,

    // Postings

    // The posting node covers the posting's text, not its indentation or line
    // ending, so postings can be selected and swapped cleanly. Comment lines
    // under a posting continue its comment in hledger; here they're siblings.
    _posting_line: ($) => seq($._ws, $.posting, $._eol),

    posting: ($) => posting($, false),

    _auto_posting: ($) => posting($, true),

    // Single-spaced text: any one whitespace character counts as a single
    // space, as in hledger, so `account<TAB>$1` is all account name. Can't start with a status mark or
    // `;`, which starts a comment line.
    account: (_) => re`[^${WS}\r\n;*!][^${WS}\r\n]*([${WS}][^${WS}\r\n]+)*`,

    // Amounts

    amount: ($) =>
      seq($._simple_amount, repeat($._amount_annotation)),

    // Lot annotations and costs, in any order. Leading whitespace is part of
    // each opening token.
    _amount_annotation: ($) =>
      choice($.cost, $.lot_cost, $.lot_date, $.lot_note, $.valuation_expression),

    cost: ($) =>
      seq(
        alias(spaced(choice('@', '@@', '(@)', '(@@)')), $.cost_marker),
        optional($._ws),
        $._simple_amount,
      ),

    // {UNITCOST} or {{TOTALCOST}}, optionally `=` fixed, or empty
    lot_cost: ($) => choice(lotCost($, '{', '}'), lotCost($, '{{', '}}')),

    lot_date: ($) =>
      seq(alias(spaced('['), '['), optional($._ws), $.date, alias(spaced(']'), ']')),

    lot_note: (_) => spaced(/\([^)\r\n]*\)/),

    valuation_expression: (_) => spaced(/\(\([^)\r\n]*\)\)/),

    balance_assertion: ($) =>
      seq(
        alias(spaced(choice('=', '==', '=*', '==*')), $.assertion_marker),
        optional($._ws),
        alias($._assertion_amount, $.amount),
      ),

    _assertion_amount: ($) => seq($._simple_amount, optional($.cost)),

    // A sign, then a commodity symbol on the left or right of the number, or no
    // symbol. Defined as functions of the number token so directives that need
    // a decimal mark can use a stricter one.
    _simple_amount: ($) => simpleAmount($, $.number),

    _styled_amount: ($) =>
      seq(simpleAmount($, alias($._number_with_decimal_mark, $.number)), repeat($._amount_annotation)),

    number: (_) =>
      new RegExp(
        `${GROUPED}([.,][0-9]*)?|(${DIGITS}([.,][0-9]*)?|[.,]${DIGITS})(${EXPONENT})?`,
      ),

    // Commodity, D and format directives must show the decimal mark
    _number_with_decimal_mark: (_) =>
      new RegExp(
        `${GROUPED}[.,][0-9]*|(${DIGITS}[.,][0-9]*|[.,]${DIGITS})(${EXPONENT})?`,
      ),

    // A quoted symbol, or any run of characters other than digits, spaces and
    // -+.@*;"{}=
    commodity: (_) => token(choice(/"[^";\r\n]*"/, /[^0-9\-+.@*;\t\r\n "{}=]+/)),

    sign: (_) => choice('-', '+'),

    // Comments with tags

    // A comment on the same line, after at least one space for a description
    // or two for an account name (fewer would make it part of the name)
    comment_text: ($) => commentText($, false),

    _posting_comment: ($) => alias(commentText($, true), $.comment_text),

    // An indented `;` line continuing the comment above. Posting comments can
    // hold posting dates, so lines in a transaction use that form.
    _following_comment: ($) => seq($.comment_text, $._eol),

    _following_posting_comment: ($) => seq($._posting_comment, $._eol),

    // `name: value`, ending at a comma or the end of the line. The name is the
    // last word before the colon.
    tag: ($) =>
      prec.right(
        1,
        seq(
          field('name', alias($._comment_word, $.tag_name)),
          ':',
          optional($._ws),
          optional(field('value', $.tag_value)),
          optional(','),
        ),
      ),

    tag_value: (_) => re`[^${WS},\r\n][^,\r\n]*`,

    _comment_word: (_) => re`[^${WS}\r\n:]+`,

    // Ledger-style posting dates: [DATE], [DATE=DATE2] or [=DATE2]
    posting_date: (_) =>
      token(
        prec(
          2,
          choice(
            /\[[0-9]+[-/.][0-9]+([-/.][0-9]+)?(=[0-9]+[-/.][0-9]+([-/.][0-9]+)?)?\]/,
            /\[=[0-9]+[-/.][0-9]+([-/.][0-9]+)?\]/,
          ),
        ),
      ),

    // Dates

    // YYYY-MM-DD with -, / or . (used consistently), or a year-less M-D.
    // Leading zeros are optional.
    date: (_) =>
      token(
        choice(
          /[0-9][0-9][0-9][0-9]+-[0-9]+-[0-9]+/,
          /[0-9][0-9][0-9][0-9]+\/[0-9]+\/[0-9]+/,
          /[0-9][0-9][0-9][0-9]+\.[0-9]+\.[0-9]+/,
          /[0-9]{1,3}[-/.][0-9]+/,
        ),
      ),

    // HH:MM or HH:MM:SS, optionally with a +HHMM/-HHMM time zone
    time: (_) => /[0-9]{2}:[0-9]{2}(:[0-9]{2})?([+-][0-9]{4})?/,

    // Directives

    _directive: ($) =>
      seq(
        // Ledger allowed a ! or @ before directives
        optional(choice('!', '@')),
        choice(
          $.include_directive,
          $.alias_directive,
          $.account_directive,
          $.apply_account_directive,
          $.commodity_directive,
          $.decimal_mark_directive,
          $.default_year_directive,
          $.default_commodity_directive,
          $.payee_directive,
          $.tag_directive,
          $.price_directive,
          $.end_directive,
          $.ignored_directive,
        ),
      ),

    include_directive: ($) =>
      seq(
        'include',
        $._ws,
        field('path', $.path),
        optional(field('comment', $.comment_text)),
        $._eol,
      ),

    // A path or glob, optionally with a format prefix like timedot:
    path: (_) => re`[^${WS};\r\n]([^;\r\n]*[^${WS};\r\n])?`,

    alias_directive: ($) =>
      seq(
        'alias',
        $._ws,
        choice(
          seq(
            field('pattern', $.regex),
            optional($._ws),
            '=',
            optional($._ws),
            optional(field('replacement', alias(re`[^${WS}\r\n]([^\r\n]*[^${WS}\r\n])?`, $.account))),
          ),
          seq(
            field('old', alias(re`[^${WS}=\r\n/]([^=\r\n]*[^${WS}=\r\n])?`, $.account)),
            optional($._ws),
            '=',
            optional($._ws),
            optional(field('new', alias(re`[^${WS}\r\n]([^\r\n]*[^${WS}\r\n])?`, $.account))),
          ),
        ),
        $._eol,
      ),

    regex: (_) => /\/([^/\\\r\n]|\\[^\r\n])+\//,

    account_directive: ($) =>
      prec.right(
        seq(
          'account',
          $._ws,
          field('account', alias(re`[^${WS}\r\n;(\[][^${WS}\r\n]*([${WS}][^${WS}\r\n]+)*`, $.account)),
          optional(field('comment', $.comment_text)),
          $._eol,
          repeat(choice($._following_comment, $._subdirective)),
        ),
      ),

    // hledger ignores indented lines under account, commodity, payee and tag
    // directives, except a commodity's format line.
    _subdirective: ($) =>
      seq($._ws, alias(re`[^${WS};\r\n][^\r\n]*`, $.subdirective), $._eol),

    apply_account_directive: ($) =>
      seq(
        alias(keywords('apply account'), 'apply account'),
        $._ws,
        field('account', $.account),
        $._newline,
      ),

    commodity_directive: ($) =>
      prec.right(
        seq(
          'commodity',
          $._ws,
          choice(
            // `commodity $1,000.00`: a sample amount showing the display style
            seq(
              field('amount', alias($._styled_amount, $.amount)),
              optional(field('comment', $.comment_text)),
              $._eol,
              repeat($._following_comment),
            ),
            // `commodity $` with optional format and other subdirectives
            seq(
              field('commodity', $.commodity),
              optional(field('comment', $.comment_text)),
              $._eol,
              repeat(choice($._following_comment, $.format_subdirective, $._subdirective)),
            ),
          ),
        ),
      ),

    format_subdirective: ($) =>
      seq(
        $._ws,
        // Preferred over a generic subdirective line
        token(prec(1, 'format')),
        $._ws,
        field('amount', alias($._styled_amount, $.amount)),
        optional(field('comment', $.comment_text)),
        $._eol,
      ),

    decimal_mark_directive: ($) =>
      seq(
        'decimal-mark',
        $._ws,
        field('mark', alias(choice('.', ','), $.decimal_mark)),
        optional($._rest_of_line),
        $._eol,
      ),

    default_year_directive: ($) =>
      seq(
        choice('Y', 'year', alias(keywords('apply year'), 'apply year')),
        optional($._ws),
        field('year', alias(/[0-9]+/, $.year)),
        $._eol,
      ),

    default_commodity_directive: ($) =>
      seq(
        'D',
        $._ws,
        field('amount', alias($._styled_amount, $.amount)),
        optional($._rest_of_line),
        $._eol,
      ),

    payee_directive: ($) =>
      prec.right(
        seq(
          'payee',
          $._ws,
          field('payee', alias(choice(/"[^"\r\n]*"/, re`[^${WS};\r\n"]([^;\r\n]*[^${WS};\r\n])?`), $.payee)),
          optional(field('comment', $.comment_text)),
          $._eol,
          repeat(choice($._following_comment, $._subdirective)),
        ),
      ),

    tag_directive: ($) =>
      prec.right(
        seq(
          'tag',
          $._ws,
          field('name', alias(re`[^${WS}\r\n]+`, $.tag_name)),
          optional(field('comment', $.comment_text)),
          $._eol,
          repeat(choice($._following_comment, $._subdirective)),
        ),
      ),

    // P DATE [TIME] COMMODITY AMOUNT
    price_directive: ($) =>
      seq(
        'P',
        optional($._ws),
        field('date', $.date),
        optional(seq($._ws, field('time', $.time))),
        $._ws,
        field('commodity', $.commodity),
        $._ws,
        field('amount', $.amount),
        optional($._rest_of_line),
        $._eol,
      ),

    end_directive: ($) =>
      seq(
        choice(
          alias(keywords('end aliases'), 'end aliases'),
          alias(keywords('end apply account'), 'end apply account'),
          alias(token(seq('end', re`[${WS}]+`, optional(seq('apply', re`[${WS}]+`)), 'tag')), 'end tag'),
        ),
        $._eol,
      ),

    ignored_directive: ($) =>
      choice(
        seq(
          choice(...IGNORED_DIRECTIVES.map((d) => (d.includes(' ') ? token(d) : d))),
          optional($._rest_of_line),
          $._eol,
        ),
        // N SYMBOL and C AMOUNT = AMOUNT, from Ledger
        seq('N', $._ws, $.commodity, optional($._rest_of_line), $._eol),
        seq(
          'C',
          $._ws,
          $.amount,
          alias(spaced('='), '='),
          optional($._ws),
          $.amount,
          optional($._rest_of_line),
          $._eol,
        ),
        // A python block takes the indented and blank lines after it
        prec.right(
          seq(
            'python',
            optional($._rest_of_line),
            $._eol,
            repeat(choice(seq($._ws, optional($._rest_of_line), $._eol), $._newline)),
          ),
        ),
      ),

    // Text hledger ignores at the end of some directives. Lower precedence so
    // it doesn't swallow what could be parsed, like the commodity in
    // `P 2024-01-01 AAPL 179 USD`.
    _rest_of_line: (_) => token(prec(-1, /[^\r\n]+/)),

    // Lines

    _ws: (_) => re`[${WS}]+`,

    // Trailing whitespace belongs to the line ending, so a whitespace-only
    // line is just a newline (and ends a transaction).
    _newline: (_) => re`[${WS}]*\r?\n`,

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
 * A posting, without its indentation and line ending:
 *
 *     * assets:checking    $-1,000.00 = $500 ; note, tag:value
 *
 * The account name ends at two or more spaces (which the account token can't
 * contain), so `_ws` after it always separates it from what follows.
 *
 * @param {GrammarSymbols<string>} $
 * @param {boolean} multiplier whether the amount may be a `*` multiplier (auto
 *   posting rules)
 * @returns {RuleOrLiteral}
 */
function posting($, multiplier) {
  return seq(
    optional(seq(field('status', $.status), optional($._ws))),
    field('account', $.account),
    optional(
      seq(
        $._ws,
        ...(multiplier ? [optional(field('multiplier', alias('*', $.multiplier)))] : []),
        field('amount', $.amount),
      ),
    ),
    optional(field('assertion', $.balance_assertion)),
    optional(field('comment', $._posting_comment)),
  );
}

/**
 * @param {GrammarSymbols<string>} $
 * @param {string} open
 * @param {string} close
 * @returns {RuleOrLiteral}
 */
function lotCost($, open, close) {
  return seq(
    alias(spaced(open), '{'),
    optional($._ws),
    optional(seq('=', optional($._ws))),
    optional($._simple_amount),
    alias(spaced(close), '}'),
  );
}

/**
 * An amount with a commodity symbol on the left, on the right, or none:
 * `$-1,000.00`, `-$5`, `10 USD`, `3 "green apples"`, `1E-6`.
 *
 * @param {GrammarSymbols<string>} $
 * @param {RuleOrLiteral} number
 * @returns {RuleOrLiteral}
 */
function simpleAmount($, number) {
  const sign = seq(field('sign', $.sign), optional($._ws));
  return seq(
    optional(sign),
    choice(
      seq(
        field('commodity', $.commodity),
        optional($._ws),
        optional(sign),
        field('quantity', number),
      ),
      seq(
        field('quantity', number),
        optional(seq(optional($._ws), field('commodity', $.commodity))),
      ),
    ),
  );
}

/**
 * A comment from `;` to the end of the line, with `name: value` tags; posting
 * comments may also hold Ledger-style [DATE] posting dates.
 *
 * @param {GrammarSymbols<string>} $
 * @param {boolean} postingDates
 * @returns {RuleOrLiteral}
 */
function commentText($, postingDates) {
  return seq(
    alias(token(seq(re`[${WS}]*`, ';')), ';'),
    repeat(
      choice(
        $.tag,
        $._comment_word,
        $._ws,
        ':',
        ',',
        ...(postingDates ? [$.posting_date] : []),
      ),
    ),
  );
}
