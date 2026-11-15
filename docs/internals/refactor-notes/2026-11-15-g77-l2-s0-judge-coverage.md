# L2 S0, part 2: how much of the corpus a row-built scheme covers, measured, 2026-11-15

Lane G. This is S0's go/no-go measurement for L2 (`l2-inferred-interfaces-design.md` §8). Part 1, on
polymorphic recursion, is `2026-11-15-g76-l2-s0-polymorphic-recursion.md`. It was measured at master
`5e45620f` with a scratch-only probe build: nothing was committed to the compiler and no seed was
refreshed from the probe.

## The question

The design builds each un-annotated function's scheme from what the checker already records: the 11
`*Cstr` tables and the 15 `HD_*` derived holes (§2.2). Every row maps to a bound kind by construction,
so "the rows map" always holds. What the rows can miss is a decision a per-position `hole*` judge makes
without leaving a row. Such a decision shapes types, and a scheme built from rows cannot see it. So the
coverage question is: **how many un-annotated functions and programs are checked without any such
judge deciding something?**

## Method

### The probe

The probe build is a copy of `compiler/` in the scratchpad:
- `check_cursor.vl` gains a recorder. It attributes each judge entry to the constraint owner (the top of
  `cstrOwnerStack`, else `curFnDeclIx`) and skips an immediate repeat:

  ```vl
  export let probeJFn: i32[] = []
  export let probeJName: string[] = []
  export function probeJudge(name: string) {
    let o = curFnDeclIx
    if cstrOwnerStack.length > 0 { o = cstrOwnerStack[cstrOwnerStack.length - 1] }
    if o < 0 { return 0 }
    const n = probeJFn.length
    if n > 0 && probeJFn[n - 1] == o && probeJName[n - 1] == name { return 0 }
    probeJFn.push(o)
    probeJName.push(name)
    0
  }
  ```
- In every `compiler/check_*.vl` except `check_cursor.vl`, a `probeJudge("<name>"); ` call is inserted
  right after the opening `{` of each function whose name starts with `hole`. The `{` is the first one
  after the parameter list's closing `)`. A file that gets one also gets
  `import { probeJudge } from "./check_cursor"`. That is **293** functions in all, the count
  `grep -cE "^(export )?function hole" compiler/check_*.vl` gives summed over the files.
- `check_program.vl` dumps the record after `checkCalleeWrites()`, as one diagnostic per entry:
  `PROBEJ <fn>|<declIx>|<U or A>|<judge>`. `U` marks a declaration with an un-annotated parameter.
- Build it with the current seed, then run each program under it:

```
vl build compiler/entry.vl --compiler build/vl-compiler.wasm -o probe.wasm   # from the probe copy
vl check --compiler probe.wasm <file> 2>&1 | grep -o "PROBEJ [^ ]*"
```

### The populations

- **Measured:** every `tests/cases` program marked `// @run` that has a named function with an
  un-annotated parameter. A parameter counts as un-annotated if it has no `:` and is not a rest
  parameter. That gives **1,464 programs** and **4,961 un-annotated functions**, counted by a regex over
  `function NAME(<…>)?(params)`.
- **Noise control:** 1,200 programs sampled from the 3,541 `@run` programs that have functions but no
  un-annotated parameter and no lambda (no `(x) =>` or `x =>`). 1,119 of the sample entered at least one
  judge. The judges they entered, **137** distinct, are generic delivery queries, not hole decisions.
- **Covered:** a function or program is covered when it enters no judge outside the noise set.

### The first control, discarded

The first control was the judges entered while checking the *annotated* functions inside the measured
population. It gave 230 noise judges and 96% coverage. Both are wrong. An annotated caller of an
un-annotated callee runs the callee's call-site judges, and they are attributed to the caller. So that
control absorbed exactly the judges it was meant to separate. The control above has no un-annotated
function anywhere in its programs.

## Result

- **Function level, body attribution only: 78.2% covered.** 1,080 of the 4,961 un-annotated functions
  entered a non-noise judge while their own body was checked. This is the floor of what the rows miss.
- **Program level, any owner, call sites included: 56.9% covered.** 631 of the 1,464 programs entered a
  non-noise judge somewhere. The difference from the function level is call-site decisions, which belong
  to the instantiation side (§4 of the design).

### Uncovered programs by judge family

A program counts once per family. The S2 prerequisites run in this order:

| order | family group | families: programs |
|---|---|---|
| 1 | function-valued holes (lane S's slot store overlaps) | `holeCall` 246, `holeArg` 175, `holeSlot` 155, `holeParam` 96, `holeLambda` 70, `holeFn` 15, `holeSet` 11, `holeCb` 4 |
| 2 | flow and bindings | `holeFlow` 188, `holeBind` 180, `holeDecl` 53, `holeAssign` 42, `holeChoice` 31, `holeBinds` 14, `holeName` 24 |
| 3 | containers | `holeArr` 141, `holeOf` 117, `holeMap` 103, `holePlace` 55, `holeRec` 27, `holeRecs` 16, `holeField` 16, `holeElem` 6, `holeOpen` 17 |
| 4 | literals | `holeDigits` 90, `holeLit` 85, `holeNeg` 65, `holeNum` 49 |
| 5 | the rest | `holeLink` 4, `holeRemainder` 4 |

Each family's prerequisite PR records the family's decision as a row, which becomes a bound at S2. That
way S2 can be byte-identical. Group 1 goes first because it is the largest and lane S owns the slots it
decides. Each PR is graded by this probe: its family's count falls to zero.

### By originating grid

Uncovered programs over programs, by `tests/cases` directory:

| grid | uncovered / programs |
|---|---|
| closures | 419 / 776 |
| generics | 87 / 223 |
| functions | 74 / 196 |
| inference | 15 / 36 |
| soundness | 9 / 45 |
| maps | 6 / 29 |
| arrays | 4 / 4 |
| lists, objects, structs, types, constraints | 2 each |
| unions, literal-unions, numerics, operators, match, simd, lint | 1 each |
| modules, std, scope, intrinsics, loops, and 8 more | 0 |

## What it decides

- **The bound alphabet is complete in kinds.** Every family above is an arrow, lower, container or
  literal bound in the design's §2.2. No new kind is needed.
- **The rows are not complete.** For about 43% of programs, part of the demand lives in a judge's
  decision. So S0's printer, plan (1), is graded only on the covered 57%: the differential check compares
  the scheme's result under a call's argument types with the type the checker gave the call. The judge
  families become S2's prerequisites, in the order above.
- **The printer is still the instrument.** S2's "identical" and each family PR's grading both need it.

## Caveats

- **Entering a judge is not deciding.** A judge that is entered and returns early still counts, so
  "uncovered" is an upper bound and "covered" a lower bound. A family PR measures its own decisions
  before claiming a count.
- **Attribution is by constraint owner, not by callee.** A judge run at a call is charged to the
  function or module containing the call. Module-scope entries are dropped (owner `-1`), so the program
  level undercounts there.
- **The noise set is sampled:** 1,119 of 3,541 control programs entered a judge. A rare generic judge
  outside the sample would count as a hole decision.
- **Populations:** `tests/cases` only. The census beyond the distilled cells is generated and was not
  run. The un-annotated count is a regex over named functions, so lambdas are attributed to the function
  that owns them.

## Addendum: the `fnTag*` / `ft*` judges, folded into group 1

Part 3's shadow printer (`2026-11-15-g78-l2-s0-shadow-ifaces.md`) found that every call whose
recorded result disagrees with its scheme is function-valued. The function-type tagger
(`check_fn_tag.vl`) decides those results, and its judges are not named `hole*`, so the probe above
never saw them. It was re-run on master `314123b8` with all 211 `fnTag*`/`ft*` functions in
`check_fn_tag.vl` instrumented beside the 294 `hole*` ones. The populations were the same, and the
dump was read through `$VL_IFACES` under `vl check --codegen`.

- **Owned attribution, the one the tables above use, is unchanged:** 1,080 functions and 632
  programs uncovered (56.8% covered; the table above reads 631). No `fnTag*`/`ft*` entry has an
  owner. The tagger runs at module scope and at emit, where `cstrOwnerStack` is empty and
  `curFnDeclIx` is `-1`.
- **Charged to the program, owner-less entries included**, `fnTag*`/`ft*` adds **146 programs** to
  group 1 (488 → 634) and makes **54 programs** uncovered that no `hole*` judge uncovers. Program
  coverage in this attribution falls from 37.5% to 33.8%. The leading judges outside the noise
  set: `ftCoercedEscape` 142, `ftHoleLambdaAlone` 135, `ftHandedHolder` 126, `ftDeclsOnly` 124,
  `ftNamedCallOf` 75.
- **Caveat:** an owner-less entry cannot be told apart from one made for a std body that the
  program links, so this attribution is an upper bound. The noise set, built the same way from the
  control, is 355 judges, against 142 for owned entries.

So group 1's prerequisite PR records the tagger's decisions as rows too, not only the `hole*`
function-valued judges. Its grading counts both: the owned `hole*` count, and the owner-less
`fnTag*`/`ft*` count of 146 programs, both falling to zero.
