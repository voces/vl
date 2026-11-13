# Step 7, lane H: `markMapUnionArms` takes only the type, 2026-11-13

Lane A's #7702 made `markMapUnionArms` (`emit_union_atoms`) read a union's map arms from its
type, through `unionSetArmTysAB`, and left its name parameter unread (`_name`). This drops the
parameter. The four callers stop passing a spelling:

- `mvShapeOfValNameArmTyGo` (`emit_union_atoms`);
- the union registration path, the keyed-row path and the named-union path (`emit_collect`).

**Measurement:** sweep (`sweep.vl diff`, master `fd1aea03` against this, fixpoint seeds on both
sides): 24,204 same, 0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler
traps.
