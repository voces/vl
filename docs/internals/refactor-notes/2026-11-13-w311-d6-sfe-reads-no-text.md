# Step 7 L2 D6: a shape field's element name reads no field text, 2026-11-13

Lane F, D6, the last field-text readers in `shapeFieldElemName` (the blocker for lane E's step d).
Measured at master `4a26a7be`.

## What changed

`shapeFieldElemName(code, fty)` loses its text parameter. Every arm answers from the field type:

| code | name recorded |
| --- | --- |
| `FC_UNION` | the union's registered name, `unionFieldNameFn`: `valueUnionKeyTextOfTy`, else `regUnionNameOfTy`, installed from `emit_sections` because both sit above this module. A field with no type is a named floor. |
| `FC_I32`, a literal-union or one-literal type | `litUnionAliasNameOfTy`, else `litUnionInlineNameOfTy`, else `oneStrLitSpelling` |
| `FC_STR`, an inline literal union | `litUnionInlineNameOfTy` |
| `FC_I32_LIST`, a string-literal set list | `tyToNominalName` |

The six callers drop their text argument, and `iisPushFieldElem` drops its `texts` parameter,
which nothing reads any more.

## Decision table (probe, 24,204 programs, text against the typed candidates)

| arm | programs and agreement |
| --- | --- |
| `FC_UNION` | 1,813 key text, 559 registry name, 1 value-union name. 114 differ: a field spelled as the twin's record union (`{c2:i32}\|{s2:i32}`) where the type is the declared `Shape2`, a twin under the #7306 ruling |
| code 0 | 124 the alias. 164 a one-literal field (`"a"`), whose spelling `oneStrLitSpelling` gives |
| code 4 | 16 of 16 `tyToNominalName` |
| code 3 | 0 reached |

## Measurement

Sweep with fixpoint seeds, master `4a26a7be` → this: all 24,206 the same. The twin-named union
fields move no byte, so that name is a label.
