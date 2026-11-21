# IR coverage: an `is` arm tag test over a record's union-box field (2026-11-21, lane IR-N1)

`emitIsTestArmTag`'s `memStruct` arm tests a record field that holds a union box: the record, a
raw `struct.get` of the field (no unboxing, no narrowing), then `boxTagIsTail`. The IR left it the
miss `is arm tag memStruct`; a trial that built the field's ordinary read was refused by the
verifier five times, the read landing at the field's narrowed rep.

## What landed

- **The read at its storage.** The IR builds the receiver under legacy's storage mark
  (`storageReadEnter`), as `storedMemberBoxTest` does, so the field read is the field's declared
  box (`RGetField`'s `gfStored`) and lowers to the raw `struct.get`; `boxTestTagOf` answers the
  tag for `memStruct`.
- **Named miss.** A stored read must be a plain box, the verifier's rule for a read at its storage:
  a field whose storage is a nullable box, or a narrowed read off its storage's declared box, is
  `is member storage rep`.

## Coverage

Measured on fixpoint seeds of this branch and of #9429's head `bfad76d3`, each building this
branch's source.

| population | #9429 | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,531 | 19,531 |
| corpus with no blocker (45,678) | 44,502 | 44,503 |
| `tests/cases` covered / matched (armed shadow) | 64,860 / 64,859 | 64,932 / 64,931 |

On `tests/cases` `is arm tag memStruct` falls from 111 rows (22 at `@start`) to 4; `is member
storage rep` is 12. The armed shadow adds no fail, differ or mismatch row.

- **Byte proof:** mode 3 self-compile identical; `ir-identity.sh --names` identical 9,037, fail
  under both 3,267, differ 0; `--cases` identical 7,590, differ 0, witnesses same 60;
  `--claimless` identical 14,014, fail under both 3,267, differ 0; `tests/cases` A/B same 8,704,
  differ 0.
- **Fuel:** L2 self-compile 107,157,810,746 against #9429's fixpoint 107,154,310,165 (+0.003%).
