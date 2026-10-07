# Lint rule scope — which rules are the language's and which are this repo's

`compiler/lint.vl` carries two kinds of rule in one pass. A **LANGUAGE** rule is advice any
VL author wants (an unused binding, a division by a literal zero). An **INTERNAL** rule
enforces the VL tree's own coding policy: its message cites a `docs/internals/` rubric, a
script under `scripts/` ratchets it, and its vocabulary (the compiler's closed kind sets,
its arena tables, its `-1` conventions) means nothing in anyone else's code.

The owner's report (2026-09-27): a file outside any VL checkout, run through `vl check` or
opened in the editor, was warned `comment-shouting`, `comment-history` and
`comment-measurement-uncited`, each citing `docs/internals/comment-style.md` — a page the
consumer does not have. `commentBudget()` excluded `std/` and nothing else, so it ran for
every other path, including the `""` a consumer's file arrives with. Four more INTERNAL
rules (`arena-scan-outside-pass`, both kind-ladder codes, both sentinel-index codes) had
no path guard at all.

## How a path reaches the lint

`lint()` reads one staged path per module (`lintSetPath` → `scaRunPath`). It is either
relative to the VL checkout or `""`:

* **CLI** — `lintScopeKeyOf` (driver.vl): an absolute target inside the checkout the
  binary resolves `std:` from is made relative; an absolute target outside it, or any
  absolute target on a distribution binary, is `""`. A **relative** target is trusted as
  spelled (it is how `lint-self.sh` and `interp-budget.py` name files).
* **Editor** — `lintPathFor` (`lsp/src/vlRoot.ts`) walks up from the document itself for
  `compiler/entry.vl` + `std/fmt.vl`; outside a checkout it answers `undefined`, and
  `wasmChecker.lint` then commits an empty path, so the seed sees `""`. Pinned by the
  editor half of `tests/vl_lint_rule_scope_test.ts`.

Every INTERNAL rule now declines unless that path is under a tree its ratchet covers, so
`""` and an unrelated project's `src/compiler/x.vl` both get none of them.

**The residual gap.** A consumer project that has its own top-level `compiler/` directory
and runs `vl check compiler/x.vl` **relative** from its own root still gets the
`compiler/` rules, because a relative target is trusted by spelling. Closing that with the
staged cwd would break `tests/vl_compiler_no_interpolation_test.ts`, which pins exactly
that relative shape from a temp root, and the real fix is not a better path heuristic but
the mechanism in [Repo-local rules](#repo-local-rules).

## The audit

Every code `compiler/lint.vl` can emit (every `lintEmit*` call, including `siReport`'s
computed code), plus the codes the editor and the scripts emit outside it. The GUARD
BEFORE column is `origin/master` at 9f11c9c9f; CORRECT SCOPE is what this change ships.

| code | class | evidence | guard before | correct scope (shipped) |
| --- | --- | --- | --- | --- |
| `unused-variable` | LANGUAGE | general hygiene; no doc cited | none | everywhere |
| `unused-import` | LANGUAGE | general hygiene | none | everywhere |
| `duplicate-import` | LANGUAGE | general hygiene | none | everywhere |
| `unused-function` | LANGUAGE | general hygiene; exports exempt by design | none | everywhere |
| `prefer-const` | LANGUAGE | general hygiene | none | everywhere |
| `unreachable-code` | LANGUAGE | code after an exit | none | everywhere |
| `constant-condition` | LANGUAGE | a literal-boolean `if`/`while` | none | everywhere |
| `for-step-zero` | LANGUAGE | a `step 0` loop never ends | none | everywhere |
| `divide-by-zero` | LANGUAGE | `/` or `%` by a literal zero | none | everywhere |
| `range-inclusive-length` | LANGUAGE | `0 to xs.length`, a likely off-by-one | none | everywhere |
| `unconditional-recursion` | LANGUAGE | a call with no exit before it | none | everywhere |
| `unused-pure-expression` | LANGUAGE | a discarded pure value | none | everywhere |
| `map-has-guard-reread` | LANGUAGE (decided) | see below | none | everywhere |
| `union-let-no-melt` | LANGUAGE (decided) | see below | none | everywhere |
| `shadowed-local` | LANGUAGE | a block-scoped binding hiding one of the same function (D3579) | n/a (new) | everywhere |
| `shadowed-function` | LANGUAGE | a function's binding hiding a module function or builtin that the function calls above it (D3599) | n/a (new) | everywhere |
| `byte-as-code-point` | LANGUAGE | a string's byte `s[i]` passed straight to a code-point position (D3641) | n/a (new) | everywhere |
| `float-list-as-vector` | LANGUAGE | a 2–4-element `f64[]`/`f32[]` literal returned, passed to a parameter read only at fixed indexes, or bound to a local read that way (`hint`; sunpa item b) | n/a (new) | everywhere |
| `shift-mask-is-logical-shift` | LANGUAGE | `(x >> k) & mask` where the mask makes it exactly `x >>> k` (`hint`; sunpa item b) | n/a (new) | everywhere |
| `prefer-interpolation` | LANGUAGE (decided) | see below; `scripts/interp-budget.py` holds the repo's own debt | not under `compiler/` | everywhere except `compiler/` (unchanged) |
| `compiler-no-interpolation` | INTERNAL | the seed must load with no host imports (CLAUDE.md "After editing compiler/*.vl") | `compiler/` only | `compiler/` only (unchanged) |
| `std-comment-audience` | INTERNAL | `docs/internals/std-api-review.md` §4; no baseline, gated at zero by `lint-self.sh` | `std/` / `std:` only | `std/` / `std:` only (unchanged) |
| `comment-block-too-long` | INTERNAL | `docs/internals/comment-style.md` rule 2; `scripts/comment-budget.py` (trees: `compiler`) | not `std/` — **fired on consumer files** | `compiler/` only |
| `comment-measurement-uncited` | INTERNAL | `comment-style.md` rule 1; `comment-budget.py` | not `std/` — **fired on consumer files** | `compiler/` only |
| `comment-shouting` | INTERNAL | `comment-style.md` rule 5; `comment-budget.py` | not `std/` — **fired on consumer files** | `compiler/` only |
| `comment-history` | INTERNAL | `comment-style.md` rule 3; `comment-budget.py` | not `std/` — **fired on consumer files** | `compiler/` only |
| `arena-scan-outside-pass` | INTERNAL | `profiling-the-compiler.md` §Guards; `scripts/scan-budget.py` (trees: `compiler`, `std`); names the compiler's pass list `asPasses` | **none** | `compiler/` and `std/` |
| `kind-ladder-incomplete` | INTERNAL | `docs/internals/kind-ladder-lint.md`; `scripts/ladder-budget.py` (`compiler/` via `ladder-census.py`); closed sets are the compiler's `Node`/`VKind`/… | **none** | `compiler/` only |
| `kind-ladder-split` | INTERNAL | as above | **none** | `compiler/` only |
| `sentinel-index-unguarded` | INTERNAL | `docs/internals/sentinel-index-lint.md`; `scripts/sentinel-budget.py` (`compiler/` via `sentinel-census.py`) | **none** | `compiler/` only |
| `sentinel-index-strict-untested` | INTERNAL | as above (the `*Strict` naming convention is the compiler's) | **none** | `compiler/` only |
| `dead-export` | INTERNAL | `scripts/export-budget.py`; not emitted by `vl check` at all — the Python walk is the rule | n/a | n/a (script-only) |
| `unused-export` | LANGUAGE | editor workspace pass (`lsp/src/moduleGraph.ts`) | n/a | everywhere |
| `redundant-export` | LANGUAGE | editor workspace pass | n/a | everywhere |
| `seed-abi-mismatch` | tooling | editor ↔ seed ABI check (`lsp/src/wasmChecker.ts`); a status notice, not a rule | n/a | n/a |

Checker-tier diagnostics (errors and `@hint`s from `typecheck.vl`) are the language's
semantics, not lint policy, and are out of scope here.

**The three ambiguous ones, decided on the merits.**

* `prefer-interpolation` — LANGUAGE. Interpolation is the language's own spelling for a
  string built from pieces, and the advice holds in any program. What is repo-specific is
  only its *exclusion* from `compiler/` (the seed cannot import `std:fmt`) and the
  `interp-budget.py` ratchet that holds this tree's standing `+` chains; neither changes
  what a consumer should see.
* `union-let-no-melt` — LANGUAGE. It is about VL's representation, not this repo's
  style: a union-typed `let` written on two paths in a loop allocates a box every trip in
  *anyone's* program, and the `const u = if … else …` spelling does not. The design doc it
  descends from (`unboxed-union-rep-design.md` §13.3) is not cited in the message, which
  says what to write instead in plain terms.
* `map-has-guard-reread` — LANGUAGE. `m.has(k)` followed by `m[k]` probes twice in any
  program and the fix is a spelling any author can make; nothing in it names a compiler
  table or cites a repo doc.

The two sentinel-index codes are the closest call the other way: the shape (a table read
whose index can be `-1`, with no bound test) exists in any program. They stay INTERNAL
because the rule's inputs are this tree's conventions — "hole fields" are fields the module
compares `< 0`, "readers" are functions that answer `-1` in band, `*Strict` is a naming
contract — and its precision was measured only on `compiler/` (a seeded sample graded
2 DEFENSIVE / 0 LIVE / 8 UNDECIDED, `sentinel-index-lint.md`). Offering it to consumers is
a design question for the mechanism below, not a scoping default.

**The ratchets are unchanged.** On this change, before and after, each `--check` prints the
same line: comment `0 / 0 / 0 / 0`, kind-ladder `363 silent ladders, 8 split walks`,
sentinel-index `311 unguarded reads, 0 untested strict reads`, arena-scan `87 scans outside
a pass`, export `0 dead-export`, interp `45 prefer-interpolation`. The full `vl check
--severity info --json` output of `compiler/entry.vl` (769 findings) and of `std/` is the
same set before and after; only `compiler/lint.vl`'s own line numbers moved.

## Repo-local rules

**Superseded (owner ruling, 2026-09-27):** the owner chose (b), done properly, over (c).
Repo-local rules will be written in VL over a syntax-tree API that also serves autofixes,
codemods and LLM agents. The design is
[`syntax-tree-api-design.md`](syntax-tree-api-design.md). The options below are kept as
the record of what was weighed.

The scoping above is a path filter inside the compiler: the policy of one repository ships
in every consumer's seed and is switched off by a prefix test. The owner asked for a
mechanism by which a repository defines its **own** rules, so the VL repo's policy lives in
the VL repo. Three options.

### (a) A repo config enables rule packs shipped in the compiler

A `vl.json` at the repository root names packs the compiler already carries, and the trees
each applies to:

```json
{
  "lint": {
    "packs": {
      "vl-comment-style": ["compiler/"],
      "vl-kind-ladder": ["compiler/"],
      "vl-sentinel-index": ["compiler/"],
      "vl-arena-scan": ["compiler/", "std/"],
      "vl-std-docs": ["std/"],
      "vl-seed-import-free": ["compiler/"]
    }
  }
}
```

The CLI (Rust host) and the editor (`vlRoot.ts`) each walk up from the file to the nearest
`vl.json`, and stage `(pack, trees)` into the seed beside the path; `lint.vl` asks
`lintPackOn("vl-kind-ladder")` where it now asks `scaIsCompiler`. Checkout detection by
marker files (`compiler/entry.vl` + `std/fmt.vl`) goes away, and so does the relative-path
residual above: a consumer with its own `compiler/` has no `vl.json` enabling the pack.

*Cost:* small — a config reader in each host, one staging channel, and a table in
`lint.vl`; about a day. *What it does not do:* the rules are still compiler code. Every
consumer's seed still carries them (the INTERNAL walks are lines 2236–5112 of
`compiler/lint.vl`'s 5,114 on 9f11c9c9f, over half the file), a policy change still needs a
compiler change and a seed refresh, and no other repository can add a rule of its own.

### (b) Rules written in VL over a syntax-tree API

A repository keeps `lint/*.vl`; each exports a rule over a typed syntax tree the compiler
publishes as a std module:

```vl
import { Node, Rule, TemplateLit } from "std:syntax"

export const rule: Rule = {
  code: "compiler-no-interpolation",
  visit: (n: Node, report: (at: Node, message: string) => i32) => {
    if n is TemplateLit { report(n, "the seed must stay import-free; build it with `+`") }
    0
  },
}
```

*Cost:* large. `std:syntax` makes the parser's node set a permanent public API — CLAUDE.md:
a std name has no deprecation story — so every later parser change becomes an API
question. The arena is not a value a separate module can hold, so the host has to either
serialise the tree or link the rule into the compiler's instance and call back through a
closure per node. Weeks, and most of it spent on a surface the current INTERNAL rules do
not use: of the eleven INTERNAL codes, **ten are text scanners** (the four comment codes,
`std-comment-audience`, arena-scan, both kind-ladder codes and both sentinel-index codes all
read the module's source line by line through `klEnsureIndex`, not the arena), and the
eleventh, `compiler-no-interpolation`, is a single check on a string literal's token.

### (c) Rule programs over source text, declared in `vl.json` (recommended)

Take (a)'s config and (b)'s location, and give a rule the input the existing rules
actually read — the file's path and text — rather than a syntax tree:

```json
{
  "lint": {
    "rules": [
      { "module": "lint/comment-style.vl", "paths": ["compiler/"] },
      { "module": "lint/kind-ladder.vl", "paths": ["compiler/"] },
      { "module": "lint/sentinel-index.vl", "paths": ["compiler/"] },
      { "module": "lint/arena-scan.vl", "paths": ["compiler/", "std/"] },
      { "module": "lint/std-audience.vl", "paths": ["std/"] }
    ]
  }
}
```

```vl
// lint/comment-style.vl — this repo's comment rubric (docs/internals/comment-style.md).
export type Finding = {
  code: string, line: i32, col: i32, endCol: i32, severity: string, message: string,
}

export function check(path: string, text: string): Finding[] {
  const out: Finding[] = []
  // … the same line walk `commentBudget` does today …
  out
}
```

The host compiles each rule module once with the seed (cached like any module), calls
`check` for every file under its `paths`, and merges the findings into `vl check` and the
editor's diagnostics exactly as lint findings are merged now. The contract is structural —
any module exporting `check(path, text)` returning those six fields — so it needs **no new
std surface** in its first form; a shared line/token index can become a std module later,
through the std review, once two rule authors want the same helper.

Why this over (a) and (b):

* **It is a move, not a rewrite.** The INTERNAL rules are already VL, already text-based,
  and already self-contained behind `klEnsureIndex`; relocating them into `lint/*.vl`
  deletes them from every consumer's seed and from the compiler's own self-compile.
* **It collapses three implementations to one.** Every INTERNAL rule exists twice today —
  in `lint.vl` and as its Python twin (`comment-budget.py`, `ladder-census.py`,
  `sentinel-census.py`, `scan-budget.py`) — with a test per pair whose only job is to keep
  them agreeing. With the rule as a program, the ratchet script grades the rule's own
  output (`vl check --json`, as `interp-budget.py` already does) and the twins retire.
  That is also the dogfooding direction: a non-VL instrument ported to VL.
* **Any repository can use it**, for its own vocabulary — webcraft or plumb can ladder-lint
  their own closed sets without the compiler knowing their names.
* **No path heuristics.** A rule runs where a `vl.json` says, and nowhere else.

*Cost:* moderate — the `vl.json` reader in both hosts (shared with (a)), a host path that
compiles a module and calls one export with two strings and reads records back (the
playground Run path and `lint-harness.vl` are the nearest existing shapes), a cache keyed
on the rule module's source, then the relocation of the four walks and retirement of the
Python twins as separate PRs. Roughly a week for the mechanism, then a PR per rule family.
Open questions for the owner: the file name (`vl.json` is a placeholder — no project file
exists today), whether an editor runs repo-declared rules before the workspace is trusted,
and whether `compiler-no-interpolation` moves too (it is a build requirement of the seed,
so it may belong in the build rather than the lint).

**Recommendation: (c), built in two steps.** First the `vl.json` reader with (a)'s pack
table as a stopgap, which retires the marker-file detection and the relative-path residual
at once. Then rule modules, relocating one family per PR, each graded by its ratchet
reading the same counts before and after. Do not build (b): its cost is a permanent public
AST for rules that do not read one.
