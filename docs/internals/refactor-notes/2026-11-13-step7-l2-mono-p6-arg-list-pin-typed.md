# Step 7 L2, mono, P6 cut 2: a record-list literal argument pins at its own type (2026-11-13)

Lane D. Base `32ab5241`. The `monoArgTyNameRep` → `arrElemSuffixed` site in lane H's render-parse
census.

## What the spelling fed

Instance identity is the typed key (`monoTypedInstKey`), whose pin heads are
`tyCanonKey(pinnedTyIx)`. A pin's type is the type handed back through `tyOut` when the arm
gives one. When it gives none, the synthesized pin node is typed by `nameToTy` of its spelling
(`recordClonedNodeTyFb`). So the spelling decided identity only because this arm handed back no
type.

## Cut

The record-list literal arm hands back the literal's own list type (`tyOut[0] = nodeTyIxOf(ix)`)
and spells the pin from it (`monoPinSpellShaped`). Two programs whose literals are the same
type now pin at that type, however the element was named.

## Decision table and grading

From an `MPROBE` build over the 24,070-record population:

| arm | programs | decisions |
| --- | --- | --- |
| pinned at the literal's type | 78 | 78 |
| open literal type, element-name fallback | 7 | 8 |

**Byte comparison:** master vs PR, **85 of 85 SAME** over every program reaching the arm. No
instance merges or splits, and the output is unchanged armed and unarmed. The spelling only
labelled: the field spelling (`{f:i32}[]`) and the row spelling (`#anon1[]`, `P[]`) parse to
types the typed key already agreed on.

## Residual

An open element type (a hole function `{f: (_) => _}`, a type parameter `(U) => void`) has no
spelling, so the arm keeps `arrElemSuffixed` of the element's name: a row handle or a function's
spelling. That is 8 decisions in 7 programs:
- `generic-fn-value-at-enclosing-type-param.vl`;
- `hole-fn-record-list-literal-relayed-to-field-call.vl`;
- `list-of-untagged-records-returned-beside-a-called-set-runs.vl`;
- `generic-list-to-unannotated-param.vl`;
- the `D9647` witness;
- `d15203_run_param`.

Closing it needs the elaborated instance type of the literal, which the census site stays open
for.
