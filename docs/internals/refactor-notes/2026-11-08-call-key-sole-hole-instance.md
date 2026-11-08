# Step 2: a hole function instanced once is keyed where its value is read (2026-11-08)

Follows [maker twins and solved hole calls keyed](2026-11-08-call-key-maker-twin-solved-hole.md)
(#6832), which left 393 `spelled` builds.

## What landed

- **One instance is that instance everywhere.** At the end of `elabRun`, each un-annotated
  function with exactly one elaboration key, made at the root, has that key noted as the value key
  of its declaration and of every name that reads it (`cwFnValueDeclOf`). Mono builds such a
  function where its value is stored or read, with no template call: `const h = (u) => u; const
  fs = [h]; print(fs[0](3))` builds the lambda at the `h` in `[h]`, and a written `let` holding a
  generic and a lambda builds the lambda at its own literal. The call was keyed, but that key was
  noted on the call only, so the build found none and `monoHoleBinding` bound the holes.
- **The `ckey` build row names its walk top, lambda and call/value half** (`/root|inst`,
  `/lam|named`, `/call|val`), so the classes below are counted from the row and not from a
  temporary one.

## The `ckey` classes, before and after

Population: the 23,679 programs of `scripts/sweep.vl -- list`, `scripts/id-shadow/run.sh --rows`.
Before is master `40a3b8a2`, after is this change on it. Both are fixpoint seeds. Counts are
instance builds.

| class | before | after |
|---|---|---|
| keyed `value` agree | 8,755 | **8,895** |
| keyed `call` (agree / refines / differ-bind) | 15,622 / 183 / 6 | 15,622 / 183 / 6 |
| `spelled`, `hole-mono` (mono's hole binding binds something) | 238 | **98** |
| `spelled`, `hole-none` | 155 | 155 |
| `lam` no key (hole-none / hole-mono) | 78 / 12 | 78 / 12 |
| instances (summed `insts` rows) | 25,273 | 25,273, no program moved |

All 140 builds that left `spelled` are `value agree`. None is `differ-bind`.

## What is left

By class on the 246 programs that carry a `spelled` build (the tagged row):

| builds | class | shape |
|---|---|---|
| 87 / 37 / 31 | `hole-none`: root named / root lambda / inside an instance | nothing to bind; `monoHoleBinding` binds nothing at these |
| 37 | `hole-mono` inside an instance | `function mk<T>(x: T) { return { fs: [inc0], x } }`: `inc0` has no elaboration key at all. Mono demands it at the default instance. |
| 31 / 30 | `hole-mono` root lambda / root named | the function has two or more keys (no sole instance), or is read past `cwFnValueDeclOf`'s 8 hops (`D12233`) |

`monoHoleBinding` still has one reader, and that reader binds something at 98 `spelled` builds and 12
`lam` builds. Its deletion waits on them. Noting the sole key under each instance of the function
that reads it moved none of the 37, because those functions have no key to note.

## Proof

- Fixpoint seed: 6,533,249 bytes against the base's 6,532,100 (+1,149, +0.018%).
- `scripts/sweep.vl` diff, base fixpoint vs candidate fixpoint: 23,679 same, 0 bytes-only, 0 output
  movers, 0 `runs → not-runs`, 0 new traps.
- `scripts/gate.sh`: 22 of 23 rows green. The red was `lint-self + fmt`, with the arena-scan
  budget at +1 for a whole-program loop in a helper. The loop now sits in `elabRun`'s pass,
  `lint-self.sh` is clean, and the final seed matches the measured one byte for byte on the 246
  affected programs.
