# Migrating to the hybrid return rule

Since AE-001 (#8383) a function's block body returns a value only through `return`. An
expression body (`(x) => x + 1`) and an `if`/`match` arm in value position keep their last
expression. This note is for a repository outside this one, such as Aeomach's: what
`vl check --fix` rewrites for you, and the shapes you write by hand.

## Run it

    vl check --fix src/

Pass a directory, or several paths, so a fix that edits another file can find it. It iterates to
a fixpoint (three rounds on this compiler). Review the diff before committing: `--fix` also
applies its other safe fixes (prefer-const, redundant annotations, unused imports). To take only
the returns, keep the lines whose sole change is an inserted `return `.

On a large tree, `vl check --json <entry>` lists every site in one check (24 s for this
compiler, where `--fix` over the directory took 28 min). Insert `return ` at each
`missing-return` and `discarded-tail-value` position yourself.

## What `--fix` writes

| diagnostic | when | the fix |
| --- | --- | --- |
| `missing-return` (error) | a value tail where a value is wanted: an annotated return type, or a lambda passed where a value-returning function type (or a `map`/`filter` callback) is expected | `return ` before the tail statement |
| `discarded-tail-value` (warning) | a pure expression left as an un-annotated body's last statement, or an `if`/`match` there whose every value-yielding arm is pure | `return ` before it (after any opening parentheses) |
| `void-callee-missing-return` (error at the caller) | a value slot, or an operand of a comparison, arithmetic or unary operator, gets the `void` result of an un-annotated function whose body ends in a call, an `if` or a `match` | `return ` before that tail, in the callee's file, when that file is in the same run (otherwise a note only) |

## What you write by hand

Two shapes reached the migration of this tree and are fixed by hand. Two more are `--fix` cases
now, through the caller's `void-callee-missing-return`: an un-annotated function whose tail is an
`if` or `match` used for its value (#8442, with the `discarded-tail-value` warning), and a `void`
operand of a comparison, arithmetic or unary operator (D16870).

1. **A lambda whose block ends in an assignment, passed where a function type wants a value.**
   `run(() => { r = null })` against `(f: () => null)` is a type mismatch, not a missing return.
   Write `() => { return r = null }`, or annotate the function the lambda is passed to.
2. **A returned value `match` or `if` that an older compiler must also accept.** This only
   matters while you bootstrap from a compiler built before the flag day. An older checker
   grades `return match k { … }` as one joined value: a literal arm widens to `string` against a
   literal-union return, and an else-less exhaustive chain is `T | null`. A `return` in each arm
   (`X => { return "x" }`) types the same under both.

## Re-pin what your tests measure

An inserted `return ` moves everything after it on its line by 7 columns. Re-pin expectations
that hold source columns: trap positions, hover and lint spans, source-map columns.
