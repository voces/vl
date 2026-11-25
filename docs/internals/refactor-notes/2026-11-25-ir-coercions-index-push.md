# Coercions: an element read as it stands, a hole closure pushed (2026-11-25, lane COV-START)

The coordinator's re-cut gave this lane the coercion classes. On master 9b13d009 the census
(all 27,421 programs, per-file unit misses) ranks them:

| class | units |
|---|---:|
| `index element coercion` | 47 |
| `push operand coercion` | 31 |
| `operand type` | 24 |
| `tail coercion`, `open temp type`, `object field coercion` | 23 each |
| `closure temp at an open type's rep` | 21 |
| `argument coercion` | 20 |

## The mechanisms, one commit each

- **An index read of a ref element as it stands.** The element's stored rep and the read's rep
  differ, and legacy writes a plain `array.get` with no cast. The IR reads at the element's rep and
  retags (`RRetag`) where the verifier already admits it:
  - a record on one heap whose fields lower alike or widen (`recRowRetag`). These are
    records of hole closures, `mk().a[1].f(3)`.
  - the element's own nullable (the ref niche's value).
- **A hole closure pushed into a list of a closed closure signature.** It is retagged
  (`holeRetagNoted`), as a list literal's element and a record field already are.

Probe of the remaining pairs:
- `index element coercion`: `{f: null}` read at `J`, a list read at another list, and box and
  atom reads.
- `push operand coercion`: closures of another arity, and maps of hole closures.
- `argument coercion`: lists of hole closures handed to another signature's list, and records
  handed to a narrower record.

Each is its own mechanism.

## Measured, master 9b13d009 → head

Same probe and lists; armed shadow over all 27,421 programs.

| reading | master | head |
|---|---:|---:|
| tests/cases distinct functions claimed | 44,289 | 44,300 |
| tests/cases start bodies claimed | 7,711 | 7,721 |
| witnesses distinct functions claimed | 11,460 | 11,465 |
| witnesses start bodies claimed | 4,998 | 5,007 |
| distilled start bodies claimed | 9,729 | 9,733 |
| `index element coercion` units (its 45 programs) | 45 | 29 |
| `push operand coercion` units (its 23 programs) | 27 | 6 |
| armed shadow mismatch, fail and fallback rows | 25 | 25, the same rows |
