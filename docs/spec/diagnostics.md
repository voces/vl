# Diagnostics

Examples run on master `98a4ed71b`, 2026-10-11.

This chapter says what `vl check` reports about a program, which of those reports make a
program illegal, what each command's exit code means, and what happens when a running
program traps. Which programs are legal is stated rule by rule in the other chapters. This
one covers how a refusal, a finding and a trap reach the user.

An example's `// warns:`, `// info:` or `// hint:` comment quotes the start of the finding
`vl check` reports on that line.

## D1. Severities

**D1.1** Every diagnostic has one of four severities: `error`, `warning`, `info` or
`hint`. Only an error makes a program illegal. A program with warnings, infos and hints
and no error builds and runs.

```vl
let a = 4                // info: `a` is never reassigned
const b: i32 = a * 2     // hint: redundant type annotation
print(b)                 // prints 8
```

**D1.2** The severities mean:

| severity | meaning |
| --- | --- |
| `error` | the program is refused |
| `warning` | the program is legal and probably wrong |
| `info` | the program is legal and a plainer spelling exists |
| `hint` | the program is legal; advice the author may ignore |

**D1.3** A warning, info or hint never changes what a program means. Taking an info's or
a hint's advice, by hand or with `vl check --fix`, leaves a program that builds and prints
the same output.

> Status: one hint breaks this. Removing a `: null` annotation that the redundant-type
> hint calls redundant turns a program that fails to build into one that runs (D4067).

## D2. Errors

**D2.1** A program is refused when it breaks a rule of the other chapters. The refusal is
an error, reported with the line and column of the construct that broke the rule. Every
error in the program is reported, not only the first.

```vl
const a: i32 = "x"       // refused: cannot assign string to 'a' of type i32
const b: string = 1      // refused: cannot assign i32 to 'b' of type string
```

**D2.2** A parse error is an error like any other. Where the parser can recover without
guessing, it goes on, and the rest of the file is still checked and reported. The summary
names the earliest stage that failed: `(parse error)` or `(type error)`.

```vl
const a = (1             // refused: expected `)` but found end of input
```

**D2.3** A constant expression is computed when the program is checked. One that has no
value is an error, not a trap.

```vl
const a = 0
print(10 / a)            // refused: division by zero in a constant expression
```

**D2.4** A program `vl check` accepts with no error builds and runs. A refusal that comes
after `vl check` has accepted the program, at build time, is a compiler defect and not a
rule of the language: either the program is legal and must build, or it is illegal and
`vl check` owed the error.

> Source: `docs/guide/soundness.md`: "if a program type-checks (zero ERROR diagnostics),
> then no operation will ever see a value of the wrong type at runtime". DECISIONS.md
> applies the bar's two clauses (soundness, and no capability refusals) without a section
> of its own, for example §"Array covariance over ALIASING lists".

> Status: the compiler has known build-time refusals of check-clean programs, each filed
> as an inventory row. One found writing this chapter is D4067. `vl check --codegen` also
> runs the build and reports these.

## D3. Findings

**D3.1** A warning, info or hint is a finding. Every finding carries a `code`: a stable
name that `vl check --json` reports and that a later suppression comment (D7) will name.
The codes in force for user programs are listed below. Rules scoped to the VL tree's own
sources (`compiler/`, `std/`) are not listed: they report nothing on other programs.

| code | severity | reported for |
| --- | --- | --- |
| `unused-variable` | warning | a binding that is never read |
| `unused-function` | warning | a function never called and not exported |
| `unused-import` | warning | an imported name never used |
| `duplicate-import` | warning | a name imported twice from one module |
| `unreachable-code` | warning | a statement after `return`, `break` or a diverging branch |
| `constant-condition` | warning | an `if` or `while` whose condition is a literal boolean that makes a branch dead |
| `divide-by-zero` | warning | `/` or `%` by a literal `0`, also beside the error when the dividend is constant (D2.3) |
| `range-inclusive-length` | warning | `0 to xs.length`, one step past the last index |
| `unconditional-recursion` | warning | a function every path of which calls itself again |
| `unused-pure-expression` | warning | a value computed and dropped, not the last statement of its block |
| `shadowed-local` | warning | a block-scoped binding hiding one of the same function |
| `shadowed-function` | warning | a binding hiding a function the same function calls above it |
| `byte-as-code-point` | warning | a string's byte `s[i]` passed where a code point is expected |
| `dead-coalesce-default` | warning | `x ?? d` where `x` can never be null |
| `prefer-const` | info | a `let` never reassigned |
| `prefer-interpolation` | info | a string built with `+` from three or more pieces that are string literals |
| `map-has-guard-reread` | info | a `has` test guarding a read of the same key, `m[k]` or `m[k] as!` |
| `union-let-no-melt` | info | a union-typed `let` written on more than one path inside a loop |
| `redundant-type` | hint | an annotation equal to what the checker infers |
| `float-list-as-vector` | hint | a 2-to-4-element float list used only at fixed indexes |
| `shift-mask-is-logical-shift` | hint | `(x >> k) & mask` that is exactly `x >>> k` |
| `inferred-export-param` | hint | an uncalled export's parameter type inferred from its body |

The set of findings may grow. A new finding is never an error, so it never refuses a
program that was legal.

```vl
function f(a: i32) {
  let b = a              // info: `b` is never reassigned
  if b > 0 {
    let b = 2            // warns: `b` shadows the `b` declared at 2:7
    return b
  }
  b
}
print(f(1))              // prints 2
```

**D3.2** A name that starts with `_` is intentionally unused. An unused variable or
function so named gets a hint instead of a warning.

```vl
function f() {
  let _a = 1             // hint: Intentionally-unused variable `_a`
  0
}
print(f())               // prints 0
```

**D3.3** A redundant-type hint is not reported on an exported declaration. The
annotations of an export are its API.

```vl
export function f(): i32 { 1 }
function g(): i32 { 2 }   // hint: redundant type annotation: `g` is inferred as `i32`
print(f() + g())          // prints 3
```

**D3.4** `for-step-zero` is a check rule, not a finding: a range with `step 0` is an
error (statements.md §S5.3).

> Status: `step 0` is reported twice, once by the checker and once as a finding with code
> `for-step-zero` and severity error (D4057).

## D4. What `vl check` shows and when it fails

**D4.1** `vl check` fails when the program has a diagnostic at or above its gate. The gate
is `error` unless `--severity <s>` sets it to `warning`, `info` or `hint`. Without the
flag every severity is shown; with it, only the gate's severity and the ones above it.

```vl
let x = 3
print(x)   // prints 3
```

`vl check` on this program shows one info and exits 0. `vl check --severity info` exits 1.
`vl check --severity warning` shows nothing and exits 0.

> Status: at `--severity info` or `hint` the summary of a failing file reads "Checked 1
> file, no errors." and does not name the gate it failed (D4068). At `--severity warning`
> it reads "Found 0 errors, 1 warning. (failing at severity warning)".

**D4.2** A file named on the command line reports its whole module graph's errors, each
labelled with the module it sits in. Its imports' findings are withheld, and the summary
counts them: "(1 import diagnostic hidden — --include-imports shows them)".
`--include-imports` shows them. Findings inside `std:` modules are withheld the same way
and shown by `--include-std`. An error inside `std:` is always shown.

**D4.3** `vl run` reports errors and no findings.

**D4.4** `vl check --json` writes one record per diagnostic. Every record has `file`,
`severity`, `stage`, `line`, `col`, `endCol` and `message`. Two keys are optional: `code`
is present on a finding, holding its D3.1 code, and absent on an error; `endLine` is
present only when the diagnostic's span ends on a later line. Lines and columns count from
1. `stage` is one of `read`, `import`, `parse`, `type`, `emit`, `validate`, `lint` and
`fix`.

**D4.5** `vl check --fix` applies the safe edits that findings offer: `let` to `const`,
removing a redundant annotation, removing an unused import (a whole import only from a
`std:` module, modules.md §M6.1), and adding the import an error names. When several
modules export the name, it adds the one whose export accepts the receiver's type, so
`xs.lastIndexOf(1)` on a list gets `std:array`'s and on a string `std:str`'s. It compiles the file before keeping each edit, and declines an
edit that would stop the file building.

## D5. Exit codes

**D5.1** Each command's exit code means:

| command | 0 | 1 | 2 | other |
| --- | --- | --- | --- | --- |
| `vl check` | no diagnostic at or above the gate | some diagnostic at or above the gate | usage error, or a file it cannot read | |
| `vl run` | the program ran to its end | a compile error, a trap, or a file it cannot read | usage error | the code the program passed to `exit` |
| `vl build` | wrote a valid module | a compile or optimise failure, or a file it cannot read | usage error | |
| `vl test` | every selected test passed | some test failed | usage error | |
| `vl fmt` | already formatted, or formatted | `--check` found a file to format | input that does not parse or cannot be read, or a usage error | 3: the formatter's own output failed to parse |

Every command exits 70 when the compiler itself trapped or emitted a module the engine
refuses as invalid. Either is a compiler defect.

> Status: `vl build` ignores an unknown flag and exits 0, though it exits 2 with no input
> file (D4100); `vl check` and `vl run`
> exit 2. A file that cannot be read exits 2 under `vl check` and 1 under `vl run` and
> `vl build`.

**D5.2** A program that calls `exit(code)` from `std:process` ends at once, and `vl run`
exits with `code`. Output printed before the call is kept.

```vl
import { exit } from "std:process"
print(1)   // prints 1
exit(5)
print(2)
```

`vl run` on this program prints `1` and exits 5.

## D6. Traps

**D6.1** A trap ends the program at the operation that cannot complete. It cannot be
caught. Output printed before the trap is kept, `vl run` exits 1, and it writes to stderr
the engine's reason, the VL source frames from innermost out, and a note in words.

```vl
function f(a: i32): i32 { a / 0 }   // warns: `/ 0` traps at run time
print(1)       // prints 1
print(f(4))    // traps: integer divide by zero, at main.vl:1:27 in `f`
```

Expected absence is a value, not a trap: a lookup that can miss returns `T | null`, and a
failure with a reason returns a union of the result and the error. A trap is for a bug.

> Ruling: DECISIONS.md §"Integer divide-by-zero stays a trap"; the language principle
> "results for expected absence, traps for bugs", `docs/guide/collections-design.md`.

**D6.2** These operations trap. Each is stated in the chapter named.

| operation | rule |
| --- | --- |
| integer `/` or `%` by zero, and `MIN / -1` | types.md §T1.2, expressions.md §E2.3 |
| a list index out of range | types.md §T6.1, expressions.md §E12.1 |
| `as!` on a value that does not fit | expressions.md §E8 |
| a read of a module binding before its initializer ran | statements.md §S3 |
| `__trap__(msg)`, or a call that returns `never` | statements.md §S8.2 |

**D6.3** Float division by zero does not trap. It gives the IEEE result (expressions.md
§E2.4).

```vl
print(1.0 / 0.0)   // prints Infinity
```

**D6.4** An integer `/` or `%` whose divisor is the literal `0` and whose dividend is not
constant is a warning (`divide-by-zero`), and traps when it runs (D6.1). When both
operands are constant it is an error (D2.3), and the same warning is reported beside it.

> Open question (Q13): whether a literal-zero integer divisor is an error, as ROADMAP B17
> planned, or stays a warning.

## D7. Suppression

**D7.1** No comment silences a finding. The `_` prefix (D3.2) is the only way to mark one
as intended, and it covers only unused names.

> Status: ROADMAP B17 plans `// vl-ignore <code>` for a line and `// vl-ignore-file
> <code>` for a file, at low priority.
