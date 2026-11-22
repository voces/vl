# Capability matrix: a narrowed box-field read × its field's storage rep (2026-11-22, lane IR-N1)

D17048 was a claimed `RBoxField` read whose node rep was not its field's storage: an atom read at
a `string`, shipped as invalid wasm. No corpus cell or filed witness had the shape, so the claim
gate could not see it. These templates grade the read at every delivery position for each
storage rep. Each one narrows a box local with `b.tag == "a"` (`GUARD`, `SETUP` binding `b`)
and adds four cells of its own, the shape the default build claims: a narrowed parameter's read
returned, bound, put in a list literal and passed as an argument.

| template | field read | master `14d707ae` | #9567 |
| --- | --- | --- | --- |
| `atom-at-string` | the discriminant, narrowed to `"a"`, at `string` | 57 runs, 13 SILENT | 70 of 70 |
| `one-literal` | a `"y"` field on an atom row shared with `"x" \| "y"`, at `string` | 57 runs, 13 SILENT | 70 of 70 |
| `bool-or-null` | `boolean \| null` | 70 of 70 | 70 of 70 |
| `literal-or-null` | `"x" \| "y" \| null` | 70 of 70 | 70 of 70 |
| `nullable-record` | `P \| null` | 70 of 70 | 70 of 70 |
| `union-box` | `i32 \| string` | 68 of 68 | 68 of 68 |
| `list` | `i32[]` | 70 of 70 | 70 of 70 |
| `record` | `P` | 70 of 70 | 70 of 70 |

The SILENT cells on master are `return_inferred` and `return_annotated` (both faces),
`local_assign`, `fn_body` and `fn_body_capture` (annotated), and all four of the template's own
cells. Each is `the emitted module failed to validate`. `union-box` skips the un-annotated
`global_assign`: its global is seeded at the fallback `1`, an `i32`.

A two-member field read (`"x" | "y"`) is an atom rep and decodes on master. The defect needs the
read's own type to be one string literal, which reps as `str`.
