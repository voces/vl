# A literal binding built wider, stored beside a literal at the container's own row, is refused, 2026-11-11

Lane w320. Base is master `ebbc4bc2`. Clause 1 → loud (clause 2).

**The defect (D15718).** `const o = { f: 4 }; const wideJ: J[] = [o]` builds `o` at `J`. Stored into
a `Map()` after a literal stored at the map's own `{f: i32}` row, `m.set("a", o)` hands a `J` to a
slot holding `{f: i32}`: invalid wasm on master. Stored first, the map is built at `J` and runs.

**Why nothing judged it.**

- A `.set` after the one that pins the slot was no own-storage delivery (`recOwnPend` ran only on
  the pinning store, check_member_call.vl). It now runs on every store at the slot's own type.
- The kept judgement (`recKeptConflicts`) runs before `recListLitsBuild` records the list literal's
  build of `o`, so a binding built by a list part was never seen as built.

**The change.** `recBuiltStoresRefuse` (check_program.vl) runs after `recListLitsBuild`. It refuses
each own-storage store of a binding the pass built at another record into a container, as
`xs.push(o)` and `m["a"] = o` already were. The refusal names the list's build and the container.
Running this order (the map built at `J` whatever its stores' order) is the open half.

**Graded.**

- Local sweep, fixpoint seeds both sides (base `origin/master`, 23,912 programs): 23,910 same, 0
  bytes-only, 2 output movers (D15718's witness and its new fixture, compiler trap → check
  reject), 0 runs → not-runs, 0 new compiler traps.
- `literal-binding-built-wider-store.matrix.vl`: the after-literal map set goes SILENT → check
  refuses. The before-literal set and the list part still run. Index set and push are refused,
  as before. Its cells grade with the template-cell generator of #7200.
