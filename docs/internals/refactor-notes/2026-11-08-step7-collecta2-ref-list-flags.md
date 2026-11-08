# Step 7: collectA#2's ref-list flags, and what stands of the walk

Measured 2026-11-08 on a 4-core box, over #6898's tree (master `4a1d010d` plus #6898). Both
seeds are fixpoints (two `refresh-compiler.sh` runs byte-identical). The population is the
sweep's 23,736 programs.

| | base (fixpoint) | candidate (fixpoint) |
| --- | --- | --- |
| sweep | | 23,736 same; 0 bytes-only, 0 output movers |
| seed bytes | 6,578,905 | 6,578,494 (−411) |

## The ref-list flags

`raUsed` was set beside `rlUsed` at all 25 of its sites and reset beside it, so it was a second
name for one fact. `raTypeIdx`, `rlTypeIdx` and `rElemKind` were written and never read: every
ref-list site resolves its own row. All four are deleted.

`rlUsed` itself had no allocation reader. `mAssignRefListPairs` mints a pair per interned row
whatever the flag says. Its 13 readers were guards that a row exists, so they now ask
`rlRowsMinted()`, which is `rlElemName.length > 0`. The 25 setters are deleted. Every one sat
beside a row intern, or beside a branch where the intern can decline, and no program in the
sweep moved.

## What stands, and why

The other flags have allocation readers. `mAssignTypeIndices` mints a heap type when its
flag is set, and that is the only thing that decides whether the type exists:

| flag | setters | readers |
| --- | --- | --- |
| `aUsed` | 94 | 60 |
| `lUsed` | 35 | 20 |
| `slUsed` | 26 | 16 |
| `ia64Used` | 25 | 15 |
| `fa64Used` | 23 | 17 |
| `fa32Used` | 20 | 15 |
| `ba8Used` | 16 | 23 |
| `mUsed` | 14 | 11 |

So you cannot change one of these flags without changing what it allocates. The setters are
`collectA`'s answer to "does some instance build this type?". Two replacements exist:

* **A pre-pass over recorded types.** `T.tys` also holds templates' types, which no instance
  builds. Deriving a flag from it would mint types that today's modules do not have. Those are
  bytes-only movers that add types, not reorder them, which is outside the reorder ruling.
* **First-use allocation while emitting.** The type section is written before the import,
  global and code sections, into one stream, and every index is final before the first body is
  emitted. A guard like `if !aUsed { emitFail(...) }` would become a minting accessor. That
  needs the sections built into their own buffers and the type section assembled last. It is
  one change to the section writer, and only after it does deleting a flag group become a
  per-group PR.

The section-buffer split comes first, in its own PR. After it, the flags are deleted one group
per PR, `aUsed` last, since string lowering forces it from 94 places.
