# Step 7 inst: list literals open in their element hold function values, so no per-instance record is missing, 2026-11-11

Lane w321. This census follows `2026-11-11-step7-inst-is-test-tys.md` (#7204) and was read on master
`ebbc4bc2` with #7204 applied. It answers the per-instance-record question for w311's list mint (#7202).

The question came from w311's list mint. A list literal whose build element holds a hole or a
type parameter: does any instance give it a closed build type? A scratch probe sat at
`arrLitMintHintTy`, where `arrLitElemHintTy` gives nothing and the build element is open. It
asked `elabLitInstTys(i)`, which reads `elabNodeTys`; the elaboration banks there every node an
instance's re-check types. It read all 7,732 `tests/cases` programs and every distilled `named/`
cell.

| at the literal | reaches | programs |
| --- | --- | --- |
| every instance that records it gives a closed element | 53 | 15 |
| of those, two instances give two distinct closed elements | 13 | — |
| an instance records it, the element stays open | 35 | 18 |
| no instance records it | 334 | 226 |

All 369 open reaches hold a function value in the element. It is a generic function or a hole
function, bare or inside a record or map (`[id]`, `[{ fs: [inc0] }]`, `[[g]]` of a hole
parameter `g`). It is called at several types after the list is built. Most such literals sit
at module scope or in a non-generic function, so no instance encloses them. Where one does
(`const fs = [k]` in `g<T>`, `k` a written generic `let`), the element is still the function
value, not `T`. Either way the list is built once and its element has no closed type per
instance. Its rep is the function's tagged set, which is the union and function-tag registry's
question. So no per-instance record is missing. The 53 closed reaches are already answered by
`elabLitInstTys`, which is frameless, so the list mint can key one row per distinct type there.
Record literals take the same `elabNodeTys` bank.

## Proof

Docs only; the probe compiler was built in the scratchpad and never refreshed into a seed.
