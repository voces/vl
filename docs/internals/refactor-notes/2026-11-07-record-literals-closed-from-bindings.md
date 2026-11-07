# Record literals closed from the bindings they read

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4 on 2026-11-07; its `§` references are to that file.

#### Record literals closed from the bindings they read (2026-11-07)

`monoClosedObjLitTy` closes a record literal's open fields at the types of the bindings they read.
Its callers were measured per decision over 23,845 programs, with the elaboration read pre-walk.

- **`monoLetWritesRecord` (#6682).** Its 2 closed answers equal the written holder's slot fact,
  which it now records. `monoLetWriteRhsTy`/`Rec` are deleted.
- **`monoPinStoredRecords`' record fields (`monoClosedFieldValTy`).** There are 4 decisions:
  - 1 equals the slot fact at `path + f.<name>`;
  - 3 decline where the fact is closed: D9183, D9252 and
    `closures/hole-fn-map-record-field-read-through-element`.

  The field now takes the slot fact, and `monoClosedFieldValTy` is deleted. Mono keeps only a
  walk-state guard: a stored value that reads a binding whose rep is not yet closed at this
  point of the walk waits for it. The three declines stay on today's later path.
- **`monoPinReturnedObj`, parked.** A record literal returned by an un-annotated function makes
  384 calls, and only 2 close a type: named `d15203_run_uncalled_record` and `d15207_rec_ret`,
  at `{fs: ((i32) => i32)[]}`. The elaboration's identity type is open there, and there is no
  return slot fact. The missing fact is a returned record of hole-function lists (Fn#d, d3125's
  lambdas returning records). `monoClosedObjLitTy` stays for it.

**The refused variant: the fact without the guard.** Taking the slot fact and recording it on
each stored value made the three declines check-clean invalid modules (`expected (ref $9), found
(ref $6)`, where `$6` is the map struct). The fact is right about the type: `{ m: hm }`'s field
is `{[string]: (i32) => i32}`. But recording it on the read of `hm` retypes the read, not the
binding, so `hm`'s open-rep map is stored where the closed struct is expected. That is a type fact
used as a rep, the #6664 family. All three are gated as witnesses or fixtures already.
