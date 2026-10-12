# The VL language specification

This directory states VL's surface: what a program means, which programs are legal, and
what the standard library and the command-line tool promise. It does not say how the
compiler achieves any of that. Representations, passes and emitted wasm are covered in
`docs/ARCHITECTURE.md` and `docs/internals/`.

Each chapter states the rules in force today. Each rule cites the owner ruling that set it,
where one exists, and is marked where the compiler has not caught up.

## Chapters

| chapter | covers |
| --- | --- |
| [lexical.md](lexical.md) | source text, comments, identifiers, keywords, literals, operators, line continuation |
| [types.md](types.md) | primitives, literal types, unions, records, nullability, lists, maps and sets, functions, generics, nominal types |
| expressions.md *(next)* | operators, numeric joins, constant arithmetic, casts, evaluation order |
| statements.md *(next)* | bindings, blocks, `if`, loops, labels, `match` |
| narrowing.md *(next)* | `is`, null tests, flow facts and what ends them |
| modules.md *(next)* | imports, exports, re-exports, resolution |
| diagnostics.md *(next)* | error, warning, hint and info categories; exit codes |
| std.md *(next)* | the standard library contract |

Open questions the sources do not settle are collected in [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md).

## Conventions

**Normative words.** *Must*, *is*, and *is refused* state the rule. A program that breaks a
rule is refused by `vl check` with an error, unless the rule says it traps at run time.

**Examples.** Every example in these chapters was run on the compiler of the date in its
chapter's header. `// prints` gives the program's whole output. `// refused:` quotes the
start of the check error.

```vl
const x = 0x10 + 1
print(x)   // prints 17
```

**Rulings.** A rule an owner ruling settled carries a `Ruling:` line. It names the date,
the option taken, and where the ruling is recorded. That is a `DECISIONS.md` section, a
section of `docs/internals/open-rulings.md`, or an inventory row `D<id>`
(`docs/internals/inventory/D<id>.md`).

> Ruling: owner 2026-09-29 (C), DECISIONS.md §"A `boolean` is never a number".

The ruling outranks every other source. Where `docs/guide/` or a design doc says otherwise,
the spec follows the ruling and the guide is out of date.

**Status.** A rule the compiler does not yet follow carries a `Status:` line. It says what
happens today and cites the open inventory row or `ROADMAP.md` item. The rule is still the
rule. The status line records the gap and does not relax the rule.

> Status: not built. `===` is a parse error today (ROADMAP A15, item 1).

**Open questions.** Where the sources are silent or disagree, the chapter writes
`Open question:` and states what the compiler does today. The question is collected in
OPEN-QUESTIONS.md with options and a recommendation. The spec does not answer it.

**Sources, in order of authority.** The order is:

1. Owner rulings.
2. `docs/guide/` and the design documents in `docs/`.
3. The compiler's observed behaviour.

Behaviour that contradicts a ruling is a defect, and is filed as an inventory row.
Behaviour that no ruling or document covers is described as it is, and is marked as an
open question if it matters.
