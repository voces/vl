# The `std:*` API review — criteria

**Every change that adds or alters a `std/*.vl` export gets a second pass against this
file before it merges.** Not a style gate: std is version-locked to the compiler
(`std-design.md` D2 — "std's version IS the compiler's version"), there is no package
ecosystem to route around a bad decision, and **there is no deprecation story**. A std
name is close to permanent, so the cheapest moment to be critical is before it exists.

The reviewer's job is **not** to forbid the patterns below. Several of them are already in
std because they were the right answer. The job is to make sure a deviation was *chosen*
and is *written down*, rather than drifting in because nobody compared.

---

## 0. Mechanical, and check it FIRST

**Is the module actually shipped?** Run:

    deno test -A --no-check tests/std_embedded_test.ts

The CLI and the Rust host read `std/` from disk and will pass regardless. **The LSP
checkers and the playground read only the generated map in `std/embedded.ts`** (§D3), so a
stale map means the module does not exist in the editor while every command-line probe in
your review succeeds. That asymmetry is why this is first and why it is mechanical: it is
invisible from the terminal. Fix is `deno task gen-std`.

---

## 1. The conventions, derived from the std that exists

Read these before reviewing anything — consistency is measured against them, not against
taste.

| convention | evidence |
| --- | --- |
| **`self` first, so exports read as UFCS methods** | `array.indexOf(self: T[], needle)`, `fmt.join(self: string[], sep)`, `buffer.loadI32(self: Buf, off)`, `utf8.encodeUtf8(self: string)` — and `array.vl`'s and `str.vl`'s headers say so outright (`fmt.vl`'s did until the 2026-09-03 audience rewrite deleted the sentence: the third time this row has gone stale, and the first time it went stale in the same commit that rewrote the file beneath it) |
| **lowerCamelCase**, except a constructor | `Buffer(byteLength: i32): Buf` is the one capitalised export |
| **generic in the element type** where it varies | all of `array.vl` |
| **union returns are ALWAYS explicit; scalar returns are usually elided** | **QUOTE THE COMMAND, NOT THE NUMBER** — this row's counts have been re-derived four times and three of the four were stale within a month. `grep -h '^export' std/*.vl` gives **128** statements (2026-09-03), minus `std/seed.vl`'s `stdSmoke` (a smoke hook, not a surface); an exported-NAMES count is a different number again, because of the four `"[]"`/`"[]="` operator forms and the re-exports in `std:args` and `std:fmt`. The half that IS the convention is exceptionless and worth checking: **16 of 16** union-returning exports annotate — `decodeUtf8`, `decodeUtf8At`, `readFile`, `readTextFile`, `writeFile`, `writeTextFile` (both via the `IoResult` alias), `listDir`, `pathKind`, `pathExists`, `programArgs`, `parseF64`, `parseI64`, `parseI32`, `decodeBase64`, `parseJson`, `toJson` — while `utf8Length`/`join`/`repeat`/`padLeft`/`toString`/`decodeUtf8Lossy` elide. The scalar half is taste, not convention. (`toString`'s union is in its PARAMETER, which this row does not govern.) |
| **the module header names what the module does NOT do** | `base64.vl`: *"The URL-safe alphabet is not here; when it arrives it gets its own name rather than a boolean parameter."* (`fmt.vl` used to be the example here, for *"f64→string … is deliberately absent"* — that deferral was spent on 2026-09-01, and a citation going stale is itself the reason to re-read the header rather than the rubric. The `base64.vl` line was re-quoted on 2026-09-03 for the same reason: §4's audience rewrite reworded it.) |
| **a width-suffixed family stays uniform** | `loadI8/loadU8/loadI16/loadU16/loadI32/loadI64/loadF32/loadF64` |

**The name must be self-sufficient in a flat namespace.** VL has **no namespace import**
(`modules-design.md`: "no namespace import in v1"), so `fs.read(p)` is unspellable and a
bare `read` collides with every other reader. That is why `encodeUtf8` repeats its module
and why `readTextFile` is not `readText`. Redundancy that would be noise under a namespace
import is load-bearing here — do not "simplify" it away.

---

## 2. Patterns to be critical of

Each is **allowed with a stated reason** — and §4 decides WHERE that reason lives. A
deviation a CALLER can see keeps its one line in the module header (`std:buffer`'s
LIFO/dangling contract, `std:fs`'s non-`self`-first spelling, `std:str`'s ASCII-only
`trim`): the caller meets it, so the caller is told. A deviation a caller cannot see moves
to `docs/internals/std-notes.md` in full — `std:fs`'s errno global is the worked case,
since `__fs_errno__` is not exported and nothing about the surface changes because of it.
A reviewer who finds a deviation with no reason anywhere should ask for the reason, not
the removal.

- **Ambient/stateful APIs.** A result that depends on a previous call, or on a global.
  Present in std twice and both are justified in place: `bufferMark()`/`bufferRelease(mark)`
  is a LIFO arena whose whole point is the ambient stack, and `std:fs`'s errno read exists
  only because `u8[] | i32` did not lower when it was written (#1806). **The test is
  whether the constraint that forced it is named where §4 puts it** — the header when a
  caller can see the deviation, `std-notes.md` when only a maintainer can. `bufferMark`'s
  ambient stack is in the header because every caller pairs the two calls; `std:fs`'s errno
  is in `std-notes.md` because no signature mentions it.
- **Order-dependent calls.** If `b` is only valid after `a`, the types should say so where
  they can, and the header must where they cannot.
- **Boolean parameters.** `f(path, true)` is unreadable at the call site. Prefer two
  functions or a literal-union parameter (`"file" | "dir"`), which VL has and which is the
  idiom (`vl-design-preferences`: unions over enums).
- **Out-parameters and caller-owned buffers.** Sometimes right for zero-copy; usually a
  worse `T | E`. Demand the measurement that says the copy mattered.
- **Silently lossy operations.** Truncation, replacement, rounding. Either the name says it
  (`decodeUtf8Lossy`) or the type does; never both silent.
- **A name that promises more than it delivers.** ASCII-only case folding called
  `toUpperCase` is the canonical trap. This is the function-name form of the standing rule
  that a type must not claim what it does not enforce.
- **A second error channel.** The model is ruled — `T | null` for absence, `T | E` for a
  reasoned failure, `__trap__` for bugs (`error-handling-design.md`). A module that
  invents sentinel returns, an `ok` boolean, or a thrown-equivalent is diverging from a
  decision, not making one.
- **Duplicated functionality.** A second `split`, a second decoder. `std:utf8` is its own
  module precisely so there is one decoder with one opinion about invalid input.
- **Anything speculative.** `std-design.md` **D2**'s admission principle (this line said D1
  until 2026-09-01, and D1 is the intrinsic floor — the block headed *"What belongs in std
  (the admission principle)"* sits inside D2; a module citing D1 for it is citing the wrong
  section, and so was this rubric): nothing lands without
  a consumer in the tree — its own illustration is *no `std:http` before a network story*.
  **Check WHICH clause admits the module**, though: the same principle separately admits
  "what the LANGUAGE story needs to be complete without third parties", and names
  `std:fmt`, `std:test`, `std:list`, `std:map`/`std:set`, then `std:fs`, `std:args` and
  `std:io` as the WASI-era additions. A module resting its case on the wrong clause reads
  as inadmissible to a reviewer who checks it.

---

## 3. Composability

- Does it compose with the **error model**? A fallible export returns `T | E`, and its
  failure is inspectable — not a bare `null` where the reason mattered.
- Does it compose with **`match` and `is`**? Prefer a literal union (`"file" | "dir"`) over
  an `i32` code the caller must remember.
- Does it compose with **UFCS chaining**? A `self`-first export that returns something
  chainable is worth more than one that returns a status.
- Does it force a caller into a pattern? An API that only works inside a particular loop
  shape, or that must be paired with a cleanup call, is one the caller can get wrong.
- **Does the generic machinery reach it?** `u8[]` is not a `T[]`, so `std:array`'s helpers
  do not apply to it. An export that silently sits outside the generic surface should say
  so in its header.
- **Can the caller SPELL the error arm?** A fallible export whose error type is borrowed
  from another module should **re-export it** (`export { E } from "std:other"`) or say why
  not. VL supports type re-export (`tests/cases/modules/reexport-type/`), it does not
  collide with an existing import of the same name
  (`tests/cases/modules/reexport-alongside-import/`), and it costs **no host imports** —
  measured. Otherwise every caller pays a second import to write one `is` branch, which is
  exactly the tax a module that cares about its call site is trying to avoid.
- **Which floor intrinsics does it declare, and do any belong to another module?** A shared
  cell makes two modules' invariants JOINT, and the header must say which module owns it.
  `std:args` declares `__fs_errno__` — `std:fs`'s — and its only `__trap__` is unreachable
  solely because `__args_get__` zeroes that cell on success. Cross-module coupling of this
  kind is invisible to every other criterion here.

---

## 4. Documentation — a std comment is written for a CONSUMER, and it is API surface

**The audience is the person who imports the module, not the person who maintains the
compiler.** This is a review criterion, not a courtesy: a std comment ships with the
name, and a name is close to permanent. Owner ruling, 2026-09-03 — the module headers had
grown into internal commentary (defect ids, PR numbers, dates, arguments with earlier
versions of the file), which is the wrong audience for the one file a caller actually
reads.

The rule, and `std-comment-audience` in `compiler/lint.vl` enforces the mechanical half of
it (scoped by module path — the `std:` key, or a target rooted at `std/` — tier `warning`,
**no baseline**: it lands and stays at zero, so a regression reds `lint-self.sh` outright):

1. **The module header is at most 10 lines**: what the module is for, how to import it, and
   any one-line contract the whole module shares — plus **what it deliberately does not
   do**, which is the one thing the old style got right. No history, no defect ids, no PR
   numbers, no dates, no "used to", no mechanism, no argument with a previous version.
2. **Every `export` carries a doc comment of 1 to 4 lines directly above it**: what it does,
   what its arguments mean, what it returns, and the edge case a caller must know — empty
   input, null, not-found, in-place vs copy, traps, allocates. Present tense, written for a
   caller, with no internal vocabulary (no reps, arenas, emitters, kinds, rows, hints). A
   FAMILY comment on the first member counts for the rest of the family (`std:fs`'s errno
   constants, `std:buffer`'s four bracket forms); a family whose members differ in a way a
   caller acts on gets a line each (`loadI8` answers -1 where `loadU8` answers 255).
3. **A non-exported helper is NOT API surface**, so the audience rule and the 4-line budget
   do not bind it: give it what a maintainer needs in order not to break it, normally 1 to 4
   lines, and CLAUDE.md's standing comment rule governs the rest. What DOES bind it is the
   ban in rule 4 — a private helper cites no row id, PR number, date or compiler vocabulary
   either, because it sits in the same file a caller reads.
4. **Anything true about the COMPILER rather than the API leaves std entirely.** Why a shape
   was chosen, what a defect did, which row graded it, what a refused candidate cost: it
   goes to `docs/internals/std-notes.md`, one section per module. **std does not link
   there** — the pointer goes one way, so a caller never lands in the internals.
5. **A contract is an API fact and STAYS** — as one or two consumer-facing lines on the
   declaration it belongs to, never as a paragraph. `array.reverse` is not in place;
   `JsonError.path` names the container on parse and the value on render; `programArgs` is
   `std:args`'s whole surface; `std:buffer`'s hoisted accessors are not `self`-first (a base
   is an address, not a receiver, so `b.getF32At(n, i)` is a type error); a `Buf` held across a
   release is *"a dangling reference into linear memory: silent corruption, not a trap"* —
   that sentence is still the standard to match, and it is one line.

**What the reviewer checks.** Does every export have a doc comment? Does each one name its
edge case? Does any comment cite a row, a PR, a date, or how the compiler works? Is the
header something a caller could read in twenty seconds and know whether this is the module
they want?

**The lint is not the rubric.** It catches a header over 10 lines, a doc comment over 4
lines on an export, and a line citing a row id, a PR number, a date or compiler vocabulary.
It cannot tell whether a comment is *useful*, whether an export is documented at all, or
whether the edge case named is the one that bites. That half is the review's.

---

## 5. The verdict

Report findings ranked by severity, each with the convention or ruling it departs from and
a concrete alternative. Then one of:

- **CONSISTENT** — merges as is.
- **CONSISTENT WITH NOTED DEVIATIONS** — the deviations are justified; the justification
  must be *in the module header*, and say so if it is not yet.
- **INCONSISTENT** — name the smallest change that fixes it.

A review that finds nothing should say what it *checked* against, so the next reviewer can
tell coverage from silence.
