# Lexical structure

Examples run on master `1df3c8f91`, 2026-10-11.

## 1. Source text

**L1.1** A source file is UTF-8 text. CRLF and a lone CR each count as one line break.
Diagnostics report a 1-based line and column.

**L1.2** Non-ASCII characters may appear only inside string literals, char literals and
comments. Anywhere else, one is refused.

```vl
const café = 1   // refused: Unexpected character 'é'
```

## 2. Comments

**L2.1** `//` starts a comment that runs to the end of the line. `///` starts a doc comment,
which attaches to the declaration that follows it (`docs/guide/doc-comments.md`).

```vl
/// adds one
function inc(x: i32): i32 { x + 1 }   // trailing comment
print(inc(1))                         // prints 2
```

**L2.2** There are no block comments. `/*` is two operator tokens.

```vl
/* block */   // refused: expected an expression but found SLASH
```

Open question: should `/* … */` be a comment, and if not, should the refusal say so? See
OPEN-QUESTIONS.md §Q1.

## 3. Identifiers and keywords

**L3.1** An identifier is `[A-Za-z_][A-Za-z0-9_]*`.

**L3.2** The following words are reserved and may not name anything:

    await break const continue else export extern false for function if
    import is let match null return true type while

```vl
let match = 1   // refused: `match` is a keyword and can't name a variable — rename it
```

**L3.3** Some words have a meaning only in a particular position and are ordinary
identifiers elsewhere:

| word | position |
| --- | --- |
| `as` | cast operator after an expression |
| `in` | a `for` loop head |
| `to`, `until`, `step` | a `for` range |
| `from` | an `import` or re-export |
| `new` | after `=` in a `type` declaration |
| `flat` | before `type` |
| `readonly` | before a list type |

```vl
let as = 6
let to = 2
let in = 3
print(as + to + in)   // prints 11
```

## 4. Statement separation

**L4.1** A statement ends at a newline or at `;`. The two are equivalent.

```vl
let a = 1; let b = 2; print(a + b)   // prints 3
```

**L4.2** A newline does not end an expression when the next line begins with a token that
cannot begin an expression: a binary operator other than `-`, `.`, or `?.`. The line
continues the previous expression.

```vl
const a = 1
  + 2
const s = "abc"
  .length
print(a + s)   // prints 6
```

> Ruling: owner 2026-09-02, DECISIONS.md §"A leading `.` on a new line continues the chain";
> owner 2026-09-04 ("B"), §"A line beginning with a token that cannot start an expression
> continues the previous expression".

**L4.3** A line beginning with `-` continues the previous expression only when whitespace
follows the `-`. A `-` touching its operand starts a new statement.

```vl
function f(): i32 {
  const a = 10
    - 2          // binary: a is 8
  -a             // a new statement, the block's value
}
print(f())       // prints -8
```

> Ruling: owner 2026-10-05 (sunpa SP-040), DECISIONS.md §"A line-leading `-` continues only
> when whitespace follows it" (D3698).

**L4.4** Inside an open `(`, `[` or object-literal `{`, a newline before a binary operator
is whitespace.

> Ruling: DECISIONS.md §"Newlines inside brackets are whitespace before a binary operator"
> (D1581).

## 5. Numeric literals

**L5.1** A decimal integer literal is digits, optionally separated by single `_`. A `_` may
appear only between two digits. A leading `0` does not make a literal octal.

```vl
print(1_000)   // prints 1000
print(017)     // prints 17
print(1__0)    // refused: `_` may only separate digits in a numeric literal
```

**L5.2** A radix literal is `0x`, `0b` or `0o` followed by digits of that base. The prefix
letter may be either case. Its type and value follow the bit-pattern rule (types.md §T2.3).

```vl
print(0x10 + 0b11 + 0o7)   // prints 26
print(0XFF)                // prints 255
```

**L5.3** A float literal has a fraction (`1.5`), an exponent (`1e3`, `2.5E-1`), or both.
The fraction needs a digit on each side of the `.`.

```vl
print(1.5e2)   // prints 150
print(.5)      // refused: expected an expression but found DOT
```

**L5.4** A literal's type comes from its context (types.md §T2).

## 6. Char literals

**L6.1** `'c'` is exactly one character between single quotes, on one line. Its value is
the character's Unicode code point, as an `i32`. Char literals take the same escapes as
strings.

```vl
print('a')    // prints 97
print('é')    // prints 233
print('ab')   // refused: Char literal must contain exactly one character
print('')     // refused: Empty char literal
```

## 7. String literals

**L7.1** A string literal is enclosed in `"`. It may span lines, and a raw line break inside
it is part of the string. A `\` immediately before a line break removes the break and the
next line's leading whitespace.

```vl
const t = "joined \
    here"
print(t)   // prints joined here
```

**L7.2** The escapes are `\n \t \r \\ \" \' \0 \b \f \v`, `\xHH`, `\uHHHH` and `\u{H…}`
(one to six hex digits, at most `0x10FFFF`). Any other character after `\` is refused.

```vl
print("a\qb")   // refused: Unknown escape sequence
```

**L7.3** `\{expr}` inside a string interpolates the value of `expr`. `${…}` has no meaning
and is ordinary text.

```vl
const x = 3
print("a\{x}b")        // prints a3b
print("${x} costs $5") // prints ${x} costs $5
```

> Ruling: owner 2026-09-01, DECISIONS.md §"ONE hole syntax, `\{expr}`".

**L7.4** A backtick is not a string delimiter and is refused.

> Ruling: owner 2026-09-06, open-rulings.md §backtick-strings-second-form. VL has one string
> form, which may span lines.

## 8. Labels

**L8.1** `@name` is a label. It marks a block or loop and is the operand of `break` and
`continue` (statements.md). A bare `@` is refused.

```vl
let n = 0
@outer while n < 10 {
  n += 1
  if n == 3 { break @outer }
}
print(n)   // prints 3
```

> Ruling: owner 2026-09-30, DECISIONS.md §"A label is `@name`, and `{ name: … }` is always an
> object" (D3374).

## 9. Operators and punctuation

**L9.1** The operator and punctuation tokens are:

    +  -  *  /  %  ^  =  !  >  <  (  )  {  }  [  ]  ,  ;  .  :  |  &  ?  ~
    ++  --  +=  -=  *=  /=  %=  &=  |=  ^=  <<  >>  &&  ||  ?.  ??  ==  !=  >=  <=
    <<=  >>=  >>>  ...  >>>=

Where several tokens could match, the lexer takes the longest. The lone `?` is used only
for an optional parameter (`b?: i32`). Their meanings are given in expressions.md.

The arrow of a function type and a lambda, and of a `match` arm, is `=` followed by `>`.
It is not one token, so `= >` with a space between is accepted.

```vl
const f = (x: i32): i32 = > x + 1
print(f(1))   // prints 2
```

> Open question (Q6): should `=>` be one token, so that `= >` is refused?

**L9.2** `===` and `!==` are not tokens yet.

> Status: not built. Reference identity `===`/`!==` is ruled (owner 2026-09-01,
> DECISIONS.md §"Referential identity is `===`/`!==`"). Today, `a === b` is a parse error
> (ROADMAP A15, item 1).
