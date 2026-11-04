# Call-time rep facts and the record solve

Three lanes stalled on one shape in a day (D15246 round 1, D15282, D15266 phase 1b): a fact about a
call's representation is recorded, then the record solve decides a copy or a share that contradicts
it, and a reader keeps reading the first fact. This note lists the facts, their order and their
readers, measured on master `bdd029c66`, and the two ways out.

## The facts the solve can contradict

The record solve's decision is per call site, in `recSitesLandAt`: a site **shares** the build its
function is kept at (`recKeptDecl`), or takes its own **copy back** to its own record
(`recSiteCopyBack` → `recCopyTyIx` / `recCopyFrom`, D15246). Facts recorded about a call's rep:

| fact | producer | when |
| --- | --- | --- |
| the call node's rep stamp (`nodeRepTyIxOf`) | the solve's adoptions (`recAdoptNote`, `recordRepTyAdopt`) | during the solve |
| an argument's rep (`recArgRepOf`) | `recAnnArgTakesRep`, from `recRepArgsNote` at the tail of `recSitesLandAt` | during the solve |
| a binding held at a call's build (`storeLetBuilt`, `recBuildPush`) | `storeLetsResolve` (check_program.vl, after `recKeptConflicts` and `recListLitsBuild`) | after the solve, same pass |
| a call bind row's rep types (`callBindRepTysAt`, `…KeyedAt`, `…MixedAt`) | `callBindAdoptReps` → `cbaRow`, reading `recArgBuiltTyIn` | once the check settles (check_pins.vl) |
| a value's kept record at elaboration (`litKeptStamp`, `recKeptFnDstOf`) | `emit_elab` | after the check |

All of them are recorded after the solve has taken its decision in that pass. So the failures are
not a stage order in the strict sense: a reader runs late enough, but it derives the rep from the
build (`nodeRepTyIxOf`, the kept function, the build table) rather than from the copy decision.

## Who read the build instead of the copy

Each of these was found by a failing witness, not by reading:

- `storeLetsResolve` (held at the build) and `callBuiltTy`, fixed in D15246 and D15266;
- `recRepArgsNote` (an argument's rep) and `recKeptConflicts` (the own-storage refusal), fixed in
  D15267;
- `recKeptValueDst` (a stored value's kept record), and the shape adapter on a read out of a
  container (`objShapeAdapterlessErr`), which is still open: D15266 phase 2, branch
  `claude/perframe-75`;
- `recArgBuiltTyIn` → `cbaRow` → `callBindRepTysAt`, read by mono's `monoArgRepRowTy` and
  `callArgRepTy`, which is still open: D15266 phase 1b. It takes `recArgRepOf`, then
  `nodeRepTyIxOf`, then the build table, and none of them sees the copy.

The pattern: a rep is answered by several readers, each with its own fallback chain, and the copy
fact had to be taught to each one as a witness found it.

## The two options

1. **Readers consult the copy first.** Every reader of a call's rep asks `recCopyFromOf(call)`
   before its own chain. This is what D15246–D15267 did, one reader at a time. It is cheap per
   reader and leaves the order alone, but the list of readers is open-ended, and only a witness
   finds the next one.
2. **The solve re-stamps.** When `recFnBuiltAtDst` commits a copy back, it also writes the call
   node's rep stamp to the copy's record (`repStampNode` / the adopt column), and drops any
   `recArgRepOf` entry it gave through that site. Every reader of `nodeRepTyIxOf` then sees the copy
   without being taught. The build stays recoverable from `recCopyFromOf`, which is the one reader
   that needs it: emit's copy lowering. D14818's stamp line in `litKeptRepFrom` already treats a
   copied call as holding the copy's record, which is the same convention.

Option 2 is one write in the producer instead of an open list of reader changes, and it matches
"one producer per fact": the copy decision would own the call's delivered rep. Its risk is
the readers that want the build and read the stamp today; a probe over `nodeRepTyIxOf`'s callers
for nodes with `recCopyFromOf >= 0` would list them before the change.
