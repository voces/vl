# IR stage 1 design: the start function as an IR body, 2026-11-18

Lane IR2. This note is written before code, as staged in ir-design §10.1. The start function's
top-level code reaches 874 drivers (about 20k lines) the claim path cannot reach.

## What legacy writes (`emitStartFnCode`, `emitInitFnCode`, `emitStartBodyCode`)

- **Entries.** There is one start entry. For a module set split into init functions
  (`gInitMods`), the start entry calls each init function, and each init function is the same
  body over its window of the top level (`startWalkWindows`).
- **The body, in order:**
  1. the string pool fill (`emitStrFillCalls`), in the start entry only;
  2. the top-level statements and the non-constant global initializers, interleaved in source
     order (`startStmtOrd` against `globalStmtOrd`);
  3. after each one, the init progress cell (`emitInitProgressAt`) for guarded globals (D2652).
- **A global initializer** (`emitStartGlobalInit`) runs only where `globalRunsInStartFn`, and
  not for a kept `const` no read reaches. It writes the cell's typed holder, the initializer
  (widened to the cell kind, or delivered by the cell's coercion, plus an arm unbox), then the
  `global.set` by the global's write class.
- **The frame.** It holds the start locals (`collectStartLocals`), then the scratch frames, and
  is reset as `emitFuncCode` resets a function's. The context is `fnIx = -1`, so identifiers
  resolve to globals. A promoted global is a start local, inside the window `gPromoInStart` arms.
- **Rows.** One `vl-src` row per top-level statement or initializer that wrote bytes (kind 1).

## The lazy-global rule

There is no lazy global. A global whose initializer runs in start and can be read by a function
before it runs is *guarded*:
- a function's read checks the progress cell (`userGlobalReadClass` "guard");
- start advances the cell after each settling position.

The read and write classes are already shared decisions over a `GlobalCtx`, with `gcInStart` for
the start. The IR's global read and write (`RGlobalGet`, `SGlobalSet`) already take them. Inside
start, the classes are "fold", "promo", "immutable" and "plain"; start's own writes are never
"guard".

## What the IR builds

**One IR function per start body: the start entry, or init function `k`.**
- It has no parameters, a void result, and the context `fnIx = -1`, the same context `nodeTyAt`
  and the global classes read.
- Its body is the merged sequence. A statement is built as the builder builds any statement. An
  initializer is its delivered value then an `SGlobalSet`, the write the IR already lowers through
  `userGlobalWriteClass`.
- A promoted global is an IR variable with a start-local slot: the "promo" class, read and
  written as a local.

**Three things are new, each named here before code:**
1. **The pool fill prologue.** A fixed effect the lowering writes through legacy's own writer
   (`emitStrFillCalls`), a shared tail with no decision in it.
2. **The progress cell advance** after position `ord`: a new statement node `SInitProgress {
   ipOrd }`, lowered by legacy's `emitInitProgressAt(ord)`, which is a tail whose decision is the
   pre-pass map `gInitProgAfter`.
3. **The start-local frame.** The locals vector is `collectStartLocals`' count, then the scratch
   frames. The lowering asks legacy's frame writer, as it does for a function's frame.

**Rows:** one per top-level statement or initializer that built nodes, as legacy banks them.

## Named misses, so a shape the IR cannot yet express never claims

- an init-function window (`gInitMods` non-empty) at first: the single-start case comes first;
- an initializer with a typed holder (`emitTypedHolderInit` returns other than 1), or with the
  arm unbox (`emitGlobalInitArmUnbox` writes);
- a start that owes the string accumulator scan (`strAccScanStart` marks an accumulator). That is
  a claim-hazard class: the builder runs the scan itself, as `strAssignInPlace` does, or misses;
- every miss the statement builder already names.

## Claiming and bars

- The start body is claimed as one function with its own family (`start`), once the shadow is
  all-matched.
- The shadow compares the start entry's code bytes and rows with legacy's, as for a function.
- The bars are the coverage-step bars: identity, mode 3, `--cases` 0 differ, and the armed shadow
  over `tests/cases` and the probes, which have a start body each.

**The measure** is the driver census with a context column. The probe counts each driver's hits
by where legacy is emitting: a user function, the start body, or a module pass. A stage-1 row is
a driver whose remaining claim-on hits came from the start body alone. Stage 1 is graded by how
many of those leave, out of 874.

## Order

1. **S1a, the shadow only:** the builder entry, `SInitProgress`, the prologue and frame writers,
   and the census context column. No claim.
2. **S1b, the claim:** the `start` family, after S1a is all-matched over the corpus, `tests/cases`
   and the probes.
3. **S1c:** init-function windows.
