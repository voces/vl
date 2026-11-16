## Codegen, memory & runtime (Track B)

- **Self-compile −0.84G L2 fuel (−0.86%):** the record-row union scan (`rrUnionsOf`,
  compiler/record_rows.vl) keys each record member's sorted field names once per type, not once
  per union it appears in (`refactor-notes/2026-11-16-rr-names-key-memo.md`). Byte-identical.
