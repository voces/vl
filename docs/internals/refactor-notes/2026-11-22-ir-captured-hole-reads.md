# IR: a captured hole-lambda binding and a captured cell of hole lambdas (2026-11-22, lane IR-D1)

Follows #9458 in the open-local family. The rest of `rep ?` was a captured read inside a lambda.
The coordinator then added six `capture binding` files, where a captured cell holds hole lambdas.

## The change

- An untyped read of a captured hole-lambda binding (`capturedClosureTy`) takes its open type at
  the uniform closure rep. The gate is legacy's two answers: the capture is a closure
  (`captureValKind`), and so is the parent binding's cell (`letBindRep`). The call through it is
  keyed by `callRefPlainKey`, which the verifier still checks the call's signature against.
  This is the coordinator's ruling (a), consistent with #9373.
- A captured cell, which legacy holds as a list of closures, is read at the capture's list
  (`capCellListSame`), where the read asks for a list of the binding's open closures. The gate:
  legacy's capture and the parent's cell are both `reflist`. One wasm type holds both lists'
  closures.

## Measured vs master 47b9d7bb (fixpoint seeds on both sides)

| population | functions | start bodies |
| --- | --- | --- |
| self-compile | 19,576 → 19,578 | 138 → 138 |
| distilled | 44,670 → 44,679 | 8,590 → 8,590 |
| tests/cases | 62,923 → 62,939 | 5,011 → 5,011 |
| capability probes | 522 → 522 | 176 → 176 |
| filed witnesses | 17,899 → 17,907 | 3,758 → 3,758 |

tests/cases first-miss rows: `rep ?` 66 → 55, `capture binding` 139 → 130. On the six named cell
files, `capture binding` functions go 18 → 8.
