# Parser notes

Long-form rationale and measurements moved out of `compiler/parser.vl` by the
2026-09-02 comment trim (the comment-block budget: 12 lines a block, 40 a module
header — `compiler/lint.vl`'s `comment-block-too-long`). Each section is the
block's text as it stood in the file; the code keeps the invariant, the WHY, and
a pointer here. Nothing in this file is graded by a gate — a claim that needs
grading belongs in `silent-class-inventory.md` as a row with a repro.

**Three references in the archived text below are STALE, and are kept only because
the move is verbatim.** `compiler/parser.ts` was deleted in #466 ("kill-TS: delete
the TS compiler core"), so "side-by-side with `compiler/parser.ts`", "the TS host
(`parser.ts` `infixBp` + `SHIFT_BP`)", "mirrors `parser.ts`'s `looksLikeObject`"
and every bare "the host" in these sections name a file that no longer exists. The
trimmed comments in `compiler/parser.vl` do not repeat them.

## Module header — grammar covered and the port history

Moved from `compiler/parser.vl` (the 39-line block at line 1, as it stood at 2026-09-02).

```text
A recursive-descent parser for a meaningful subset of VL, written in VL
(the H3 self-hosting track).

Side-by-side with `compiler/parser.ts`, which it will eventually replace. It
consumes a token stream (the `Tok[]` on the global `P`, filled by the driver
from the self-hosted lexer's output) and builds the discriminated-union arena
AST defined in `compiler/ast.vl`. Grammar covered:

  program    := stmt*
  stmt       := letDecl | funcDecl | ifStmt | returnStmt | block | exprStmt
  letDecl    := ("let" | "const") IDENT (":" type)? ("=" expr)?
  funcDecl   := "function" IDENT "(" params? ")" (":" type)? block
  params     := param ("," param)*
  param      := IDENT "?"? (":" type)? ("=" expr)?
  ifStmt     := "if" expr block ("else" (ifStmt | block))?
  returnStmt := "return" expr?
  block      := "{" stmt* "}"
  type       := IDENT                       (a single type-name annotation)
  expr       := assignment (precedence climbing, right-assoc "=")
  unary      := ("!" | "-" | "~") unary | postfix
  postfix    := primary ( "(" args? ")" | "." IDENT )*
  primary    := NUMBER | STRING | CHAR | "true" | "false" | IDENT | "(" expr ")"

── Structure: mutual recursion ──────────────────────────────────────────────
Recursive descent is intrinsically mutually recursive — the expression levels
re-enter through `(expr)` / call args, and a block re-enters statements — so
these are written as the natural separate functions (`parseExpr` ↔ `parseUnary`
↔ `parsePrimary`, `parseStmt` ↔ `parseBlock`, …). The one rule: a forward-
referenced / mutually-recursive function must DECLARE its return type — so
every parser function is annotated `: i32` (the arena index it produces),
idiomatic for a parser anyway.

All parser state lives in the `Parser` struct fields, reached through the module
global `P` (`compiler/ast.vl`): the token stream, the node arena, the
diagnostics, and the cursor. Constructors `.push` onto the struct-field arena
directly. (`P` is a global rather than a struct parameter as a STYLE choice —
see the note in `ast.vl`.) Errors append a `Diag` (VL has no exceptions) and the
parser recovers by synthesizing an `ErrExpr` leaf or skipping a token, so the
walk always terminates (panic-free).
```

## startsStmt — the three members unreachable from a body position

Moved from `compiler/parser.vl` (the 21-line block at line 208, as it stood at 2026-09-02).

```text
Whether the token kind plausibly STARTS a statement. The mirror image of
`isSyncKind`: those are the points a mis-parse recovers AT, these are the
tokens a recovery can resume FROM — the gate on `parseBracedBody`'s unbraced-
body recovery below. Membership is the union of `isStmtKeyword` and the
leading tokens of `parsePrimary` / `parseUnary`, minus two deliberate
exclusions:
  • `{` — a braced body is the ORDINARY path, so it never reaches the gate;
  • `else` — an `if` whose then-branch is missing outright (`if c else { … }`)
    is not an unbraced body, and gets the plain `expected `{`` diagnostic.
Everything else a body position can face — `)`, `,`, `=`, `await`, a NEWLINE,
EOF — is not a statement start, so `if c }` and a truncated `if c` keep the
existing behaviour instead of inventing an arm out of a closer.

THREE MEMBERS ARE UNREACHABLE FROM A BODY POSITION and are still listed,
because the predicate answers about STATEMENTS, not about this one caller.
Measured over one `if` body per member: `(`, `[` and `-` never arrive, since
the CONDITION's expression parse has already consumed them as a call, an
index and a subtraction (`if c (x)` is `c(x)`, `if c -x` is `c - x`). There
is no unbraced body to recover there — the tokens belong to the condition —
so the gate is simply never asked. Dropping them would encode one caller's
precedence accident into a general predicate.
```

## expectClose — a zero-token skip is a faithful recovery

Moved from `compiler/parser.vl` (the 23-line block at line 327, as it stood at 2026-09-02).

```text
`expect` for a structural CLOSER (`)`, `]`, `}`, the generic `>`): on
mismatch, diagnose once and skip forward to the closer, consuming it — so
`f(a b)` costs one diagnostic and the `)` still closes the call. The skip is
bounded by the sync tokens, a statement-start keyword, and `{` (a nested
construct), so a genuinely MISSING closer abandons at the boundary instead
of swallowing following code.

A ZERO-TOKEN SKIP IS A FAITHFUL RECOVERY, AND IS MARKED LOSSLESS (stage 2 of
the lossless-recovery work; DECISIONS.md §"A recovered parse IS typechecked").
The two outcomes of the scan are not the same kind of event:

  • it stopped AT the boundary having consumed nothing — the closer is simply
    MISSING (`print(1` at end of line, a block whose `}` never arrives). The
    tree then holds every token the user wrote plus ONE inserted closer, so a
    type error read off it is a real one and the driver may run the checker.
  • it consumed tokens on the way — those tokens are GONE from the tree, and a
    count or a type read off what is left is fiction. Not marked; the file
    keeps the parse bail, which is what the phantom pins in
    `tests/vl_lossless_recovery_test.ts` exist to hold.

The marker's contract is "the program the checker sees is the program the user
wrote, up to the inserted token" — an inserted CLOSER satisfies it exactly as
`parseBracedBody`'s inserted braces do.
```

## takeSep — the inserted `,` is same-line only

Moved from `compiler/parser.vl` (the 48-line block at line 379, as it stood at 2026-09-02).

```text
Whether a delimited list CONTINUES past the element just parsed. A real `,` is
consumed. A MISSING one — the cursor already sits on the next ELEMENT, as in
`f(1 2)`, `[1 2]`, `{x: 1 y: 2}` or `function f(a: i32 b: i32)` — is diagnosed
and INSERTED: the caller's loop simply goes round again, so every element the
user wrote lands in the tree.

THE INSERTED `,` IS A LOSSLESS RECOVERY, and it is the point of stage 2. The
predecessor recovery had no separator arm at all: an element-starting token
ended the list and fell through to `expectClose`, whose scan SKIPS TO THE
CLOSER — that is what turned `f(1 2)` into a hole-free `f(1)` and made its
`wrong number of arguments: expected 2, got 1` fiction. Nothing is dropped
here and nothing is invented beyond the one separator the message names, so
the arity the checker reads is the arity on the screen.

`startsElem` is the CALLER's element-start test — an expression for a call /
array literal, a field key for an object literal, a parameter name for a
parameter list — because "another element" is a different set per list. A
token that starts no element of THIS list (a stray closer, a statement
keyword, `{`) still ends the list and still reaches `expectClose`'s bounded
skip, still lossy and still gating.

AND THE INSERT IS SAME-LINE ONLY — the guard is the whole difference between a
faithful recovery and a phantom, and it was measured as a phantom first. Every
caller here skips NEWLINEs before asking (a list may legally span lines), so
without the guard a missing CLOSER at end of line reads as a missing COMMA and
the NEXT STATEMENT is swallowed as an element:

    const xs = [1, 2      →  `expected `,` but found `print``, then
    print(xs.length)         ``xs` is used before it is assigned` and
                             `list element expects a value, got void`

Two type errors about a program nobody wrote, and — because `expectClose` then
reaches EOF having consumed nothing — a LOSSLESS mark that lets the checker
run on it. Master reports exactly one diagnostic there (`expected `]` but
found `print``), and so does this, because a NEWLINE between the element and
the element-start token declines the insert and falls through to
`expectClose`'s bounded lossy skip.

THE PRICE IS REAL AND IS THE RIGHT ONE: a missing comma at the end of a line
inside a MULTI-LINE list is no longer inserted, so it keeps the old lossy
recovery and is not typechecked. A closer that is missing and a separator that
is missing are indistinguishable at a line end — the tokens are identical —
and guessing "separator" there is what invents a program. On ONE line they are
distinguishable, because a list that ends on that line has its closer there.

Read from the token stream rather than a flag threaded through the four
callers: `skipNewlines` leaves the NEWLINE it consumed at `P.pos - 1`, so the
question "was a newline crossed" is already recorded where it happened.
```

## binPrec — the flat `==` ladder

Moved from `compiler/parser.vl` (the 21-line block at line 441, as it stood at 2026-09-02).

```text
── operator precedence ──────────────────────────────────────────────────────
Binary-operator binding power; higher binds tighter. `0` means "not a binary
operator", which is also the loop-terminating sentinel in the climber.
Binding powers follow the TS host (`parser.ts` `infixBp` + `SHIFT_BP`),
remapped onto this compressed contiguous ladder but preserving the host's
RELATIVE order, looser→tighter:
  ??/|| < && < `|` (bitwise OR) < `^` (XOR) < `&` (bitwise AND) < ==/!=
       < relational < shifts (`<<`/`>>`/`>>>`) < +/- < * / %
Bitwise `|`/`^`/`&` bind BELOW equality/relational (so `a & b == c` is
`a & (b == c)`), and the shifts sit BETWEEN relational and additive (so
`a + b >> c` is `(a + b) >> c` — shifts looser than `+`).

A FLAT `==` LADDER over the atoms. The climber asks this of EVERY token that
could follow an operand and the overwhelmingly common answer is `0`, so the
tokens that most often END an operand chain (a statement terminator, an
argument/element separator, a closer) are rejected up front and the 25
operator arms follow. A `TokKind` compare is `i32.eq` against a constant — the
ladder costs one register compare per arm, nothing is called, and the
no-longer-needed first-character bucketing (which existed only to avoid
`__str_eq__` CALLS, and had to keep full string compares inside each bucket
because `(first char, length)` collides over this vocabulary) is gone with it.
```

## atTypeCont — a banked `>` credit is an unclosed enclosing generic

Moved from `compiler/parser.vl` (the 15-line block at line 565, as it stood at 2026-09-02).

```text
True when the NEXT token is `kind` AND it may extend the type just parsed — i.e.
no `>` is still owed by a consumed `>>`/`>>>`.

A BANKED CREDIT IS AN UNCLOSED ENCLOSING GENERIC, AND THE CLOSE IS THE ONLY THING
THAT MAY HAPPEN NEXT. The lexer fuses `>>` into ONE token, so in `Box<Box<i32>> | i32`
the inner close consumes the whole `>>` and the outer argument list is still open with
one `>` banked — at which point the raw `peekKind()` of the argument's own union loop
sees the OUTER `|` and extends the ARGUMENT with it, folding `Box<Box<i32>> | i32` into
the single type `Box<Box<i32>|i32>`. The three continuation loops (`|`, `&`, `[]`) all
read the token this way, and the generic argument list's own `,` loop already consults
the credit for exactly this reason — this is that same test, given one home.

The credit is what discriminates, not the token: `Box<Box<i32>|i32>` spelled with a
plain `>` closing the inner application banks nothing, so its `|` still extends the
argument. Two spellings, two trees, from the same continuation token.
```

## block-scoped `type` declarations (D1045)

Moved from `compiler/parser.vl` (the 29-line block at line 582, as it stood at 2026-09-02).

```text
── D1045: block-scoped `type` declarations ──────────────────────────────────
A `type` declared inside a block is LEXICALLY SCOPED (DECISIONS.md §"A `type`
declared in a function body is legal and lexically scoped"). The scope is
implemented HERE, in the parser, for one reason: recursive descent is lexical
by construction, so "the rest of this block" and "the enclosing function's type
parameters" are both already on the stack — every other pass would have to
rebuild them, and the checker has several statement-list readers, so a missed
one would be a SILENT hole rather than a diagnostic (D1045's interim note (a)).

THE MECHANISM IS THE MODULE MERGE'S, not a second one. The merge renames every
top-level declaration `name` → `name$mN` precisely so that two modules' `Pair`
are two types to the tables that hold them (`typecheck.tyToStr`'s header says
so), and `demangleMsg` strips the suffix on the way to a person. A body-scoped
`type` is the same problem one scope in — two functions may each declare a `P`
— so it takes the same answer: the declaration is minted under a unique name
(`P` → `P$b7`), every reference in its lexical extent is spelled at that name,
and the declaration node is HOISTED into `progStmts` (`parseProgram`). Every
consumer that looks a type up BY NAME — `cUserTypes`, the generic-alias and
newtype registries, the emitter's per-declaration walks, canon — then works
unchanged, which is what makes this a scoping change and not a rep change.

TYPE-PARAMETER CAPTURE IS A GENERIC ALIAS. `type P = { a: T }` inside `f<T>` is
minted as `type P$b7<T> = { a: T }` and referred to as `P$b7<T>`, so the
substitution per instantiation is the one the language already performs for a
module-scope `Pair<A>` applied at a type parameter (measured: `Pair<T>` inside
`f<T>` runs at two pins). Only the parameters the declaration MENTIONS are
captured — an unmentioned one would make an unrelated declaration generic, and
`type Id = new i32` in a generic body would silently stop being a newtype (a
generic newtype is not in this phase; `typecheck`'s pass 0a says so).
```

## btCaptureScan — a token lookahead, not a walk of the parsed body

Moved from `compiler/parser.vl` (the 15-line block at line 682, as it stood at 2026-09-02).

```text
The live type parameters the REST of this declaration mentions, in declaration
order — the capture set of a body-scoped `type`.

A TOKEN LOOKAHEAD, not a walk of the parsed body, because the answer is needed
BEFORE the body is parsed: a self-reference (`type N = { next: N | null }`) is
spelled while the body is being read, and it has to carry the same arguments
every other reference does. Deciding afterwards would leave the self-reference
at the wrong arity with no way to widen a finished spelling node.

The scan is a statement scan: it ends at a NEWLINE/`;` at nesting depth 0 — or
at the `}` that closes the enclosing block — and steps over a newline that a
multiline union continues with a leading `|`. Over-scanning would only capture
a parameter the declaration does not mention, which costs an unused alias
parameter; under-scanning would leave `T` unbound, so the continuation case is
handled rather than left to chance.
```

## parseMethodMemberTail — the receiver is implicit

Moved from `compiler/parser.vl` (the 14-line block at line 875, as it stood at 2026-09-02).

```text
A METHOD MEMBER's tail, shared by the two grammars that read a `{ … }` member
list: `parseTypeAtom`'s inline object arm and `parseTypeDecl`'s declaration
body. The caller has already consumed the member NAME and holds the spelling
mark it was taken before; this consumes `( argument types ) : result`.

The parameters listed are the CALL's arguments and the receiver is implicit —
there is no `self` (ruled 2026-09-01; `docs/constraints-design.md` OQ-1). That
is not a shorthand for a UFCS signature: a zero-ary closure FIELD satisfies
`{ f(): string }` and takes no receiver at all, so writing the receiver into
the bound would describe only one of the two witnesses.

Renders to the synthetic name segment `f(A,B):R` and leaves ONE `TS_METHOD`
root on the spelling stack — kids = the argument types, then the RESULT last,
which is `TS_FUNC`'s layout and what `ast.tsToName` writes back.
```

## the function-type RETURN extends as far right as it can

Moved from `compiler/parser.vl` (the 16-line block at line 969, as it stood at 2026-09-02).

```text
The return type extends as far RIGHT as it can (`parseTypeName`, so a
union/intersection chain): `(i32) => i32 | null` is a function returning
`i32 | null`, NOT a nullable function — parenthesize the FUNCTION for
that (`((i32) => i32) | null`). Synthetic name `"(params)=>ret"`; the
`=>` marks it a function type.

This grouping is `nameToTy`'s, not a choice: the checker resolves the
synthetic name by taking a top-level `=>` as binding LOOSER than `|`/`&`
(`isTopLevelFuncTypeName` guards the union split), so `(i32)=>i32|null`
has ALWAYS denoted a function returning `i32?`. Reading the RETURN as a
single atom and letting the caller's union loop close over the result
built the opposite tree from the same tokens — invisible while the tree
was thrown away and the string was the only survivor, and measured at
451 annotations in 87 corpus files once the parser started keeping it.
The emitted NAME is identical either way (the same characters are
concatenated in the same order), which is why nothing downstream moves.
```

## parseTemplate — why the desugar lives in the parser

Moved from `compiler/parser.vl` (the 29-line block at line 1223, as it stood at 2026-09-02).

```text
AN INTERPOLATED LITERAL, DESUGARED HERE into the string concatenation it
means: `` `v=\{x} ok` `` becomes `"v=" + <render>(x) + " ok"` — and so does
`"v=\{x} ok"`, because ONE hole syntax serves both quoted forms and the lexer
mints the same `TEMPLATE_HEAD`/`MID`/`TAIL` run for either. Nothing below
asks which delimiter opened the literal; the part lexemes carry it and
`tplPartStrLex` is delimiter-agnostic.

WHY THE DESUGAR IS HERE AND NOT A `TemplateLit` NODE KIND. Three measurements
decided it, in this order:
  1. `format.vl` recovers a literal from its SOURCE SPAN (`literalSlice` →
     `sliceNode`), not by re-printing the AST. A no-hole template is a
     `StrLit` whose span is the whole `` `…` `` and round-trips byte-for-byte
     with no formatter change at all; a template with holes needs only the
     `binTpl` marker on the root `+`, which is the shape `binCompound`
     already established for `a += b`.
  2. `nodeTyIx` is sized to the arena at `checkProgram` entry, so a node
     minted by a LATER desugar reads its type back as -1 forever (D969 is the
     recorded cost). Minting the whole chain in the parser puts every node
     inside the checker's own numbering, so the concat, the render call and
     the hole are typed and repped by the ordinary machinery.
  3. A new `Node` variant would need an `is` arm in nine files' dispatch
     chains, each of whose catch-alls fails SILENTLY, to buy nothing that (1)
     and (2) do not already give.
The type-directed half of the lowering — a `string` hole is delivered
directly, everything else goes through the renderer — survives intact: it is
the checker's, at the one place the hole's type is known (`checkCallNode`).

The renderer is named `TPL_RENDER_LOCAL`, which no program can spell. It is
NOT a scope lookup: see that constant's header.
```

## `as` is a contextual keyword in exactly one position

Moved from `compiler/parser.vl` (the 13-line block at line 1641, as it stood at 2026-09-02).

```text
`x as T` — an explicit numeric CAST (B2). `as` is a CONTEXTUAL keyword: it
stays a plain `IDENT` token (so it remains usable as an identifier and
`import { a as b }` — matched by text — is untouched), special ONLY here,
directly after a postfix operand on the same line. It occupies the same
precedence slot as the `is` guard below: looser than the POSTFIX operators
(`.`/`()`/`[]`, already consumed by `parsePostfix`) but tighter than every
BINARY operator, so `a + b as f64` is `a + (b as f64)`. A PREFIX unary (`-`,
`~`) recurses through `parseUnary`, so it binds looser than `as` (`-b as i64`
is `-(b as i64)`) — the reverse of Rust, but unobservable for numeric casts
(negation / bitwise-not commute with wrap / trunc / demote). CHAINABLE
(`x as i64 as f64`). A newline before `as` ends the statement (no
`skipNewlines` here), so a following `as = 1` reassignment of the soft-keyword
identifier is unaffected.
```

## parseAsType — the cast target is one type ATOM

Moved from `compiler/parser.vl` (the 13-line block at line 1739, as it stood at 2026-09-02).

```text
The TARGET type of an `x as T` cast, as a synthetic NAME string. A single type
ATOM (`parseTypeAtom`), NOT a full `parseTypeName`: a top-level union `|` or
intersection `&` must stay a binary OPERATOR after the cast (so `a as i32 | b`
is `(a as i32) | b`, honouring `as`'s tighter-than-binary precedence). The
checker rejects any non-numeric-scalar atom with "`as` supports numeric
conversions only", so an unusual target (`x as string`, `x as i32[]`) still
parses here and errors cleanly at the type tier.
D-PARSETY P3: the spelling is KEPT and banked on the `AsExpr` node by the
caller (`annTsOf` keys on any node, not only a `TypeRef`) — the same one-slot
channel `parseIsType` uses. #1121 deferred this leg on the reading that "the
cast target is a numeric primitive, so the merge has no consumer"; the target
is whatever `nameToTy` resolves to a numeric scalar, which includes a user
ALIAS (`type Id = i32`), and the merge renames that alias's DECLARATION.
```

## `new` is a contextual keyword guarded by the second token

Moved from `compiler/parser.vl` (the 14-line block at line 2030, as it stood at 2026-09-02).

```text
NOMINAL NEWTYPE (webcraft P1.5): `type EntityId = new i32` /
`type F32View = new { … }` declares a type that is DISTINCT from its body in
the checker and ERASED at emit (`docs/internals/newtype-design.md`).

`new` is a CONTEXTUAL keyword, recognized only here — one position, one token
of lookahead — so it stays a legal identifier everywhere else in the language
and no existing program can be broken by the addition. A hard lexer keyword
would have been free against the corpus (zero occurrences as an identifier in
`std`, `tests/cases` or `compiler`) but reserves a common word language-wide
for one declaration form.

The GUARD is the second token: `new` is the marker only when a type FOLLOWS it
on the same construct. `type N = new` alone still means "alias of the type
named `new`", which is what it means today.
```

## a map type in a type DECLARATION position

Moved from `compiler/parser.vl` (the 19-line block at line 2061, as it stood at 2026-09-02).

```text
`type N = A | B | C` — a discriminated-union ALIAS (the RHS is a type name, not
a `{`). Parse the `member (PIPE member)*` list into a `UnionDecl` — a member
is an intersection chain of atoms (bare names, literal types: `type T = "a" |
"b"`, inline objects). A single bare name `type N = A` (no `|`) is also
accepted as a one-member union. (A compound `{ … } & { … }` RHS takes the
LBRACE path below and re-encodes as a UnionDecl when an `&`/`|` follows the
closing brace.)

A `{`-LEADING RHS is normally the STRUCT body below — except an index-signature
MAP type `{[K]: V}`, whose `{` opens a map, not a field list. `type M = {[string]:
i32}` took the struct path and died on `expected an identifier but found [` at the
`[`, in EVERY position (declaration alone, let/param/return/field annotation, and
`{[K]:V} | null`) — 7 of 7 shapes censused, while the same type written INLINE
(`const m: {[string]: i32}`) and the same map as a struct FIELD type both worked.
The map grammar already lives in `parseTypeAtom`, so the fix is the DISPATCH: a
`{` immediately followed by `[` is a type ATOM and belongs on this path, which
reaches `parseTypeAtom`'s map arm through `parseVariantName`. The lookahead is
exactly the atom's own (`{` then `[`, no newline skip between them), so the two
grammars cannot disagree about what opens a map.
```

## D188 — an array suffix on a `{ … }` body

Moved from `compiler/parser.vl` (the 22-line block at line 2239, as it stood at 2026-09-02).

```text
D188 — AN ARRAY SUFFIX ON A `{ … }` BODY, WHICH WAS SILENTLY DROPPED. `type L =
{n: i32}[]` reached here with `[` `]` still on the stream, no continuation arm
claimed them, and the declaration was completed as the plain STRUCT `{n: i32}`;
the two tokens were then re-lexed as the NEXT statement, an empty array literal.
`vl fmt` printed the parse back verbatim — `type L = {n: i32}; []` — which is
what named the mechanism after a counter build read `reach=0` at the alias
transparency arm the row had blamed.

BOTH OUTCOMES ARE WRONG AND ONE OF THEM IS SILENT. Reading the alias as an array
(`const c: L = [{n: 7}]`) is a loud check reject at every position — D188 as
filed. Reading it as the STRUCT it was misparsed into (`const c: L = {n: 7}`)
COMPILES AND PRINTS, so the declaration silently means something other than what
it says. The loud half is the one that got filed because it is the half a
programmer writing an array alias hits first.

The suffix is consumed HERE rather than in a continuation arm because it binds
tighter than `&` and `|`: `{a: i32}[] | null` is a nullable ARRAY, and the union
loop below must see `{a:i32}[]` as its first member. `atTypeCont` is
`parseTypeAtom`'s own suffix test (`pendingGt == 0 && LBRACK`), so the two
grammars cannot disagree about what a `[]` suffix is, and NO newline is skipped
ahead of it — a `[` on the next line opens a statement, exactly as it does after
any other annotation.
```

## a brace-leading union may be wrapped across lines

Moved from `compiler/parser.vl` (the 15-line block at line 2269, as it stood at 2026-09-02).

```text
Object-type structural intersection `type AB = { … } & { … }`, or a
union whose FIRST variant is an inline object: the struct body was only the
first operand. Re-encode the RHS as a `UnionDecl` over synthetic names —
the checker's `nameToTy` folds the `&` chain into a merged TyObj.

A multiline union puts each `|` on its own line, so a NEWLINE may precede the
continuation — skip newlines before testing for it, exactly as the bare-name
union path above does, and RESTORE the cursor when nothing follows so a plain
`type N = { … }` does not swallow the newline that terminates it. Without the
skip a brace-leading union was the ONE union that could not be wrapped across
lines (`type A = { a: i32 }` / `  | { b: i32 }` was "expected an expression but
found PIPE", while the same union with a NAMED first member parsed), which in
turn made `vl fmt` fail its own re-parse check on an over-width one.  The
widening is total: `|` and `&` cannot begin a statement, so every token
sequence this newly accepts was previously a hard parse error.
```

## parseFuncBodyAndBuild — the four body forms

Moved from `compiler/parser.vl` (the 13-line block at line 2514, as it stood at 2026-09-02).

```text
Parse a function BODY and build the `FuncDecl` — the cursor on the first token
of the body (past the signature and any `=>`). The body is:
  • a bare EXPRESSION (no `{`) — implicit return, wrapped in a one-stmt Block;
  • empty braces `{}` — a BLOCK (a void function), never an empty object
    (mirrors the host's `emptyBraces` special case);
  • braces that shape up as an object literal (`function makePoint() { x: 3 }`)
    — an object-literal EXPRESSION body (implicit return), decided by
    `looksLikeObject` exactly as the host's `parseStatement` path does;
  • otherwise a braced statement BLOCK.
Shared by `parseFuncTail` (the `function`-keyword forms) and `parseArrowLambda`
(the `=>` form), so both bodies parse identically. `funcPos` is the form's
START offset, stamped on the FuncDecl; `nameTok` is the name token (`-1` for
the anonymous forms).
```

## the body's live type parameters are pushed at the one shared entry

Moved from `compiler/parser.vl` (the 13-line block at line 2535, as it stood at 2026-09-02).

```text
A BARE-EXPRESSION body (`function dbl(x: i32) x * 2`): no `{` after the
signature means the body is a single expression with an implicit return —
wrapped in a synthetic one-statement Block so downstream passes see the same
shape as a braced trailing-expression body. An OBJECT-LITERAL body
(`function makePoint() { x: 3, y: 4 }`) is the same implicit-return shape:
the `{` opens an expression, not a block — but EMPTY braces `{}` stay a
block (a void function), matching the host's tie-break.
D1045 — THE BODY'S live type parameters. A `type` declared in this body may
NAME them (the ruling's second half), and it captures them by becoming a
generic alias; the enclosing generics' parameters stay live too, so a nested
function's body sees both. Pushed here rather than in `parseFuncHead` because
this is the one entry every body — `function`, method, and arrow lambda —
goes through, and the signature's own annotations are already parsed.
```

## D444 — the arity of a non-index operator declaration

Moved from `compiler/parser.vl` (the 19-line block at line 2613, as it stood at 2026-09-02).

```text
ARITY of a NON-INDEX operator declaration (silent-class-inventory D444).
Operator dispatch is binary and only binary: `checkBinary` reaches
`opSelfFnTy`, which returns -1 unless the declaration is exactly
`(self, other)`, and `checkUnaryNode` has NO operator lookup at all — it
asks `isNumeric` and stops. So a declaration at any other arity can never
fire at any receiver, and there is no other way to reach it either: `-` is
not an identifier, so no call can be written, and the quoted spelling mints
the identical name. It is exactly "a name no reference could ever be written
for", which this file already refuses for a quoted NON-operator
(`function "shout"`) and the checker already refuses for a mis-arity `"[]"`.
This is the third shape of the same reject, and the only one that was silent.

REPORTED HERE, not at the checker's hoist where the index operator's twin
lives, because arity is SYNTACTIC — the index rule needs the resolved
receiver TYPE (D445) and this one needs nothing the parser does not hold.
Nothing in the tree, in std, or in the census corpus declares one, so the
reject costs no capability; the price is the 40 `d425c*` cells' arity-2
NEIGHBOURS, which this gate deliberately does not touch — an arity-2
declaration over a built-in receiver is D425 and is still open.
```

## D471 — the pollution rule said out loud

Moved from `compiler/parser.vl` (the 24-line block at line 2645, as it stood at 2026-09-02).

```text
THE POLLUTION RULE, SAID OUT LOUD (silent-class-inventory D471). At the
right arity, `opSelfFnTy` still returns -1 unless the FIRST parameter is
NAMED `self` — before it consults any type, which its own comment calls
"the pollution rule". So an arity-2 declaration whose first parameter is
named anything else is inert at EVERY receiver, an object one included:
measured over 380 cells (`scripts/silent-sweep/d471-opdecl-grid.py`),
ZERO of them dispatch, against 60 that do the moment the parameter is
renamed `self`.

WHY THIS IS A REJECT AND NOT A DESIGN QUESTION LEFT OPEN. The worry the
row filed was that refusing here decides `function -(z, b)` is not a legal
ordinary FUNCTION either. It is not one, and that is measured rather than
argued: `-` is not an identifier, so `-(7, 1)` is a parse error and the
quoted spelling mints the identical name — there is no call syntax for it
at any arity. The declaration is exactly "a name no reference could ever
be written for", which is the criterion the arity gate above already
applies, which `indexOpDeclName` below already applies to `"[]"`/`"[]="`
(a non-`self` first parameter there is a hard parse error today), and
which this file already applies to a quoted NON-operator
(`function "shout"`). This is the last of those four shapes that was silent.

SYNTACTIC, so it belongs here and not at the checker's hoist: the rule is
about the parameter's NAME. D425's twin — an arity-2 `self` whose TYPE can
never be a dispatch receiver — needs the resolved type and lives there.
```

## D46 — `==` and `!=` are not overloadable

Moved from `compiler/parser.vl` (the 20-line block at line 2854, as it stood at 2026-09-02).

```text
`==` AND `!=` ARE NOT OVERLOADABLE, and this is the ONE place both spellings converge —
the symbol-token arm (`function ==(self, b)`) and the quoted arm (`function "=="(…)`)
land on the same `name`, so one test covers both.

THE DECLARATION USED TO PARSE, TYPE-CHECK AND DO NOTHING. `checkBinary` returns on the
equality arm before the operator-dispatch tail and `drwDispatchOp` excludes `==`/`!=` at
the emitter, so a program with one printed the STRUCTURAL compare's answer — a `vl check`-
clean WRONG VALUE, the outcome class this file's inventory ranks above invalid wasm
because nothing refuses it. `eqRefusals` was meanwhile ENDING ITS REFUSAL with an
instruction to write exactly this declaration. (`silent-class-inventory` D46.)

REJECTED RATHER THAN IMPLEMENTED, and the deciding measurement is the diagnostic's own
customer: it fires on a CONTAINER (`K[]`, `Circle[]`), whose compare recurses through
`emitStructEqRec` / `emitListEqRCore` / `emitListEqSCore` — three cores with no per-element
dispatch hook — and through `isEquatable`, std's four `needle: T` exports and the map key.
Honouring the top-level struct case alone would leave the message still prescribing
something inert one container deep, which MOVES the trap instead of removing it. Nothing
in the tree declares one, so the reject costs no capability; the remedy clause is retired
in the same change, because a diagnostic that recommends a declaration the compiler now
refuses is worse than the one that recommended an ignored one.
```

## parseBracedBody — the bounded unbraced-body recovery

Moved from `compiler/parser.vl` (the 30-line block at line 2960, as it stood at 2026-09-02).

```text
A body that REQUIRES braces — `if` / `while` / `for`, and since 2026-09-01
`else` too (it used to be the one arm where a bare statement was legal; see
DECISIONS.md) — with BOUNDED recovery for the unbraced form.

Without it a single missing brace CASCADES: `expect("LBRACE")` diagnoses and
leaves the cursor put, `parseBlock` then swallows the rest of the file as the
body, and its `expectClose` reports a second, phantom `expected `}` but found
end of input`. One mistake, two diagnostics, and the second one names a
position the user never wrote. So when the offending token plausibly STARTS a
statement, take it as the body: emit ONE diagnostic anchored on that token
(`msg` names the construct and shows the braced spelling, the shape the
`then`-removal refusal uses) and parse exactly one statement as the arm. The
recovery is bounded by `parseStmt` itself — one statement, never a scan — so
a real error further down the file still surfaces from its own position.

The gate is `startsStmt`, so a closer or a truncated construct is NOT
recovered: `if c }` and `if c` at end of input keep the plain `expected `{``
diagnostic, where inventing an arm would be a guess rather than a reading.

THE RECOVERED ARM IS LOSSLESS, and the diagnostic says so (`dgMarkLossless`,
ast.vl): the arm IS the statement the user wrote — `parseStmt` consumes it
exactly as a braced body would have, no token is dropped and none is invented
— so every type error over the resulting AST is a REAL one. That is what lets
the driver run the checker anyway (DECISIONS.md, 2026-09-01) and report the
parse mistake TOGETHER with the type error four lines down, which the
first-error bail used to swallow. The `parseBlock` fall-through below carries
no mark of its own — whether it ends up lossless is `expectClose`'s answer,
and it is the SKIP that decides: a closer that is merely missing drops no
token and IS lossless, one whose scan ate tokens on the way is not, because a
dropped token is exactly what makes a later type error fiction.
```

## parseMatchPattern — a type pattern is a real IsExpr

Moved from `compiler/parser.vl` (the 25-line block at line 3149, as it stood at 2026-09-02).

```text
One match arm pattern: a STRING literal (a litunion member), `_` (the wildcard, lexed as
the identifier `_`), or a TYPE (a VALUE-union arm — `C`, `i32`, `{c: i32}`, `null`). Any
other token is a parse error.

A TYPE pattern is minted as a real `IsExpr` over the SCRUTINEE node, exactly the node
`scrut is T` would have produced — so the check type's spelling tree is banked the same way
(`setAnnTs`, D-PARSETY P2), the module merge renames it through the same arm, the lint
walker's flat type-name scan sees it, the checker's `narrowTys`/`isVarTyIxOf` ABI is filled
from the same place, and `desugarMatchAt` can use the pattern node ITSELF as the arm's
condition. There is no second narrowing path and no second type-name channel.

The pattern is minted here rather than at desugar time because `isVarTyIx`/`nodeTyIx` are
sized to the node arena at `checkProgram` entry: a node minted later reads back -1 forever.
It also keeps `annTsNode` strictly increasing (the node is minted immediately after its
spelling parse, before the arm BODY's nodes).

A pattern is ONE type ATOM (`parseTypeAtom`), not a whole `parseTypeName`: the arm separator
`|` must stay the OR-PATTERN separator it already is for string patterns, so `A | B => …`
is two patterns joined into `(u is A) || (u is B)` — the form the emitter lowers. A single
`is` against a UNION check type does not lower at all (`emitProgram: \`is\` names a type that
is not a union variant`, on master too), so reading `A | B` as one union-typed pattern would
have type-checked and then failed in codegen.

`(` is likewise not a pattern starter: `(A|B) =>` would be eaten by `parseTypeAtom`'s
FUNCTION-type arm (`(params) => ret`), silently swallowing the arrow and the arm body.
```

## parseMatchPayload — the clause is unambiguous where it is legal

Moved from `compiler/parser.vl` (the 14-line block at line 3205, as it stood at 2026-09-02).

```text
The optional PAYLOAD clause of a variant pattern (phase 2b): `Move{x, y}` binds one arm-local
`const x = <scrut>.x` per named field. Returns a `Block` holding those `LetDecl`s, or -1 when the
pattern carries no clause. Punned field names only — `{x: a}` (renaming) and `{p: {x, y}}`
(nested) are recorded as deferred in docs/internals/match-design.md.

The clause is unambiguous exactly where it is legal: after a pattern's type atom the only tokens
the arm grammar allows are `|`, `=` (of `=>`) and this `{`. The arm BODY's own `{` is on the far
side of the `=>`, and an inline object TYPE pattern (`{c: i32} => …`) is consumed WHOLE by
`parseTypeAtom` before this ever peeks, so it cannot be mistaken for a payload clause on an
empty pattern.

The initializer reads the SHARED scrutinee node — the same node every arm's `IsExpr` tests, so
the binding narrows through that arm's `is` fact exactly like the hand-written
`if cmd is Move { const x = cmd.x … }` this lowers to.
```

## looksLikeObject — the statement-position `{` lookahead

Moved from `compiler/parser.vl` (the 16-line block at line 3378, as it stood at 2026-09-02).

```text
Decide whether the `{` at absolute token index `bracePos` opens an OBJECT
LITERAL (an expression) rather than a BLOCK. At statement position a `{` is
otherwise dispatched as a block, so this lookahead recovers the bare
object-literal / implicit-return case (`{ tokens: toks, diags: gDiags }`).

Mirrors `parser.ts`'s `looksLikeObject`: skip NEWLINEs after `{`, then
  • `}`            ⇒ object  (empty `{}`, ANTLR order)
  • a stmt keyword ⇒ block
  • IDENT then (past newlines) `:` / `,` / `}`  ⇒ object
  • IDENT then a balanced `( … )` then (past an optional `: type`) `{` ⇒ object
    (method shorthand `{ add(a,b){…} }` — distinguishes it from a block whose
    first statement is a call like `{ foo() }`)
  • STRING then (past newlines) `:`             ⇒ object
  • otherwise      ⇒ block
(The host's computed-key `{ [e]: v }` form doesn't occur in the self-host
sources, so it's omitted here.)
```

## importSpecCharMsg — one sentence, two scanners

Moved from `compiler/parser.vl` (the 14-line block at line 3530, as it stood at 2026-09-02).

```text
THE SENTENCE for a char-quoted module specifier (`from 'std:fs'`), in ONE home
because the parser and the driver's token-level `modScan` both have to say it —
two scanners over one statement drifting apart is the whole of the defect that
made a char-quoted specifier adopt the next string literal in the file.
`raw` is the char literal's RAW LEXEME, quotes included — the suggestion is
built from the source text rather than the decoded value so an escape survives
it verbatim (`'a\tb'` suggests `"a\tb"`, not a literal tab), and so both callers
can pass the one thing they both have.

It names the SPELLING, not the resolution. `'std:fs'` resolves to no module for
a reason that has nothing to do with module paths: single quotes are a char
literal, which is one code point (an i32), and a specifier is a string — so the
whole repair is the quote character, and "unsupported specifier" would send the
reader to look for a module that is sitting right there.
```

## parseImport — token consumption is identical to the old skip

Moved from `compiler/parser.vl` (the 15-line block at line 3552, as it stood at 2026-09-02).

```text
Parse an `import { a, b as c, … } from "path"` (or `import x from "path"`)
statement into an `ImportDecl` node, the cursor on the leading `import`.
Import BINDING stays the module front end's job (the driver's token-level
`modScan` is the resolver and never reads this node) — the node exists for
AST consumers (the lint tier: a never-referenced imported name). Token
consumption is IDENTICAL to the old skip (`skipModuleClause`): tokens up to
and INCLUDING the trailing path STRING (the `from` clause keyword rides as an
`IDENT`), BOUNDED by a NEWLINE/SEMI outside the braces or a statement-start
keyword — a malformed clause missing its path literal is diagnosed here
instead of silently swallowing code up to the next unrelated string literal.
Only brace-list names are recorded (`a` / `a as b`, each with its NAME
token); a bare `import x from "path"` records no names — a pure graph edge,
exactly `modScan`'s reading. A CHAR literal in the path position is a
specifier — the wrong quotes, not a missing path — and gets its own sentence
(`importSpecCharMsg`) rather than `malformed import`.
```

## D1045 — the hoist into progStmts

Moved from `compiler/parser.vl` (the 15-line block at line 3725, as it stood at 2026-09-02).

```text
D1045 — THE HOIST. A body-scoped declaration is ALSO a top-level statement of
the program: that is what makes the checker's passes 0a–0d register it and the
emitter's per-declaration walks (`collectS`, `collectU`, `gaeCollectDecls`,
`resolveFlatLayouts`, …) mint its rep, all of which read `progStmts` and only
`progStmts`. Widening those ~15 walks instead is the position-matrix mistake;
one unique name in the list they already read is the same result with nothing
to keep in step.

APPENDED, so a hoisted declaration registers AFTER every module-scope one. A
local type may name a module type (pass 0b fills in DEMAND order, so even a
forward reference resolves); a module type can never name a local one.

The node stays where it lexically is as well — it is reachable twice, and
`ast.isBodyTyDecl` is what the two consumers that must not double-count it ask
(the module merge; the formatter re-slices the source and is immune).
```
