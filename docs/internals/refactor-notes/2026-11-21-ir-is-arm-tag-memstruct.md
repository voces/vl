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

MEASURED
