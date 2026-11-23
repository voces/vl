# IR: a captured holder of one bundle member, 2026-11-23

Lane IR-N4. Base: master b03c57be. One of `capture binding`'s five shapes (the bundle parameter
returned and called at one signature, `tests/cases/closures/bundle-parameter-returned-and-called-at-one-signature.vl`).

## Change

`irBDeclVar` holds a `const` keeping one closed member of a returned record as that member's
closure (`holderMemberTy`), and `globalHolderTy` does the same for a module binding. `capTyOf`, the
capture's binding type, did not. The capture's type stayed open, `capRepAtTy` gave no rep, and
`captureRead` missed.

- `capTyOf` takes `holderMemberTy` for a `LetDecl`, under the same guard as `irBDeclVar`.
- A holed capture read whose type is held open returns the capture as it is held, rather than
  retagging it to a rep whose type is open. The value would have no type otherwise, which is the
  global holder read's reason for the same rule.

## Predicates and their legacy callers (R8)

| predicate | callers |
| --- | --- |
| `holderMemberTy` | `emitHolderCall`'s member route, and legacy's cell kind for the holder |
| `irTyHeldOpen` on the read's type | the global holder read's rule, here for a capture |

## Legacy tails the IR calls

- None new.

## Witnesses and readings

`tests/ir-shadow-rows/capture-holder-member.vl` reads a holder of one member in a closure, a lifted
function, a nested closure and twice. Master leaves four functions on `capture binding` and one on
`callee captures`; this branch matches all 21 and the start, with the same output and bytes.

Fixpoint seeds on both sides, master b03c57be against this branch, `VL_STD` the tree's:

- tests/cases: `capture binding` functions 7 → 6; matched 79053 → 79054; 0 fail or mismatch rows
  on both.
- Self-compile: 20378 covered, matched and claimed on both; modes 1, 3 and 5 build the plain bytes,
  the same as master's.
- `ir-identity --names`: differ 0, self-compile identical. `--claimless`: identical 14047, differ 0.
  `--cases`: identical 7722, fail under both 68, differ 0; witnesses same 61, differ 0.
- tests/cases legacy A/B: identical 7435, fail under both 67, differ 0; nothing moved.
- Order check (mode 6): 0 order rows over the distilled corpus and over tests/cases.
- `self-ir-misses`: 0 missed. Deep nesting: 8 passed; the labelled-loop margin passes at 910 KB and
  fails at 900, as master's seed does.
- Fuel: L2 121639512648 on both.

After merging master with #9764 (the narrowed box capture, the same function): the merge was clean.
On the merged fixpoint, both rows match (21 and 9 functions and their starts), `scripts/gate.sh
--fast` passes, `--cases` reads identical 7747 and differ 0, `self-ir-misses` reads 0, deep nesting
passes 8, and the margin is master's.
