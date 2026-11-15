## Type system (Track A)

- **Every quiet level goes through one API** (review medium 3): `quietEnterFlat`/`quietLeaveFlat`
  carry the pin-note rollback for read-only asks that do not deepen `quietDepth`. The shadow
  interface printer's quiet read no longer keeps its pin notes. `inferQuiet` hidden scopes go from 5
  to 2. Byte-identical over 20,453 programs. The substitution design's P4 and P5 are dropped, and the
  note records why.
