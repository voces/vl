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

## 1. The conventions, derived from the std that exists

Read these before reviewing anything — consistency is measured against them, not against
taste.

| convention | evidence |
| --- | --- |
| **`self` first, so exports read as UFCS methods** | `array.indexOf(self: T[], needle)`, `fmt.join(self: string[], sep)`, `buffer.loadI32(self: Buf, off)`, `utf8.encodeUtf8(self: string)` — and `fmt.vl`'s header says so outright |
| **lowerCamelCase**, except a constructor | `Buffer(byteLength: i32): Buf` is the one capitalised export |
| **generic in the element type** where it varies | all of `array.vl` |
| **return types elided when inferred** | `toStr`, `repeat`, `utf8Length` carry none — VL's types-invisible aesthetic applies to std too |
| **the module header explains WHY and names what it does NOT do** | `fmt.vl`: *"f64→string … is deliberately absent — `print` keeps covering floats"* |
| **a width-suffixed family stays uniform** | `loadI8/loadU8/loadI16/loadU16/loadI32/loadI64/loadF32/loadF64` |

**The name must be self-sufficient in a flat namespace.** VL has **no namespace import**
(`modules-design.md`: "no namespace import in v1"), so `fs.read(p)` is unspellable and a
bare `read` collides with every other reader. That is why `encodeUtf8` repeats its module
and why `readTextFile` is not `readText`. Redundancy that would be noise under a namespace
import is load-bearing here — do not "simplify" it away.

---

## 2. Patterns to be critical of

Each is **allowed with a stated reason in the module header**. A reviewer who finds one
without a reason should ask for the reason, not the removal.

- **Ambient/stateful APIs.** A result that depends on a previous call, or on a global.
  Present in std twice and both are justified in place: `bufferMark()`/`bufferRelease(mark)`
  is a LIFO arena whose whole point is the ambient stack, and `std:fs`'s errno read exists
  only because `u8[] | i32` does not lower yet (#1806) — with a comment saying so and a
  note that the swap is three lines. **The test is whether the header names the constraint
  that forced it.**
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
- **Anything speculative.** `std-design.md` D1's admission principle: nothing lands without
  a consumer in the tree. `std:args` was deliberately *not* shipped alongside `std:fs` for
  this reason.

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

---

## 4. Documentation

The house style is dense and explanatory, and it is a **review criterion, not a courtesy**:

- The module header states what the module is, what it is built on, and **what it
  deliberately does not do**.
- Every non-obvious decision carries its WHY at the point of the decision.
- Failure modes are stated. `std:buffer` says a `Buf` held across a release is *"a dangling
  reference into linear memory: silent corruption, not a trap"* — that sentence is the
  standard to match.
- Where a measurement drove the design, the number is in the comment.

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
