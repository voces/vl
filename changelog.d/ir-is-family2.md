## Codegen, memory & runtime (Track B)

- **IR coverage: `is` at its storage and the remaining box arm tags.** An `is` at its storage
  runs the ordinary rung with its receiver read at the storage; a narrowed variant's or a record
  variant's box field tests its arm tag; a literal set over a box's string payload tests each
  member, as legacy writes them. A head guard the instance decides true cuts its block even where
  its test is written. No legacy bytes moved.
