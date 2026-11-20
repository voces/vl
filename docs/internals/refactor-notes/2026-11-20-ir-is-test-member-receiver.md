# IR: an `is` test over a member receiver at its storage (2026-11-20, lane IR6)

`if z.h is A`, with `h: A | B | C`, is a storage-mode `is` test (`isTestsStorage`): legacy's
`emitIs` reads the receiver at its storage, the field's declared box, and tests its tag.
`storedBoxTest` took only a local box (`rawBoxVar`); a member receiver missed with `is box not a
local`, every corpus function of it from the d3204 grid.

## The change

`storedMemberBoxTest`: the receiver built with `irBExpr` between `storageReadEnter` and
`storageReadLeave` on that receiver, the plain storage-mark pair `storedBoxTest`'s own decisions
and legacy's `emitIs` use (never memberBox's seat), its rep required to be the box (`is member
storage rep` otherwise), then the tag `storedBoxTest` already decided under the same mark. The
mark is node-exact, so `z` inside `z.h` reads as itself, and `readRepOf`, the one node-keyed memo
the storage-sensitive classifiers consult, bypasses its memo for a storage read. `exprTyOf`
answers a storage read's store type (memberBox), so a receiver narrowed by an earlier test builds
at the field's declared union.

## Witness

`tests/cases/narrowing/is-test-at-storage-of-a-member-receiver.vl`: the same `z.h` read plainly
before the test, at its storage under two `is` tests, narrowed after an early return, and bound
then re-tested, off a generic and a declared receiver.

## Readings

Both seeds fixpoints, master at merge-base `a42095870`:

| reading | master | this branch |
|---|---:|---:|
| distilled functions claimed (`--claims`) | 41,379 | 41,469 (+90) |
| distilled `is box not a local` (one-blocker functions, all d3204) | 90 | 0 |
| self-compile functions claimed | 18,637 | 18,637 |
| armed shadow, distilled | | 41,542 of 41,542 matched |
| L2 self-compile fuel | 103,741,585,294 | 103,747,118,054 (+0.005%) |

`ir-identity.sh` plain, `--names` and `--cases`, mode 3, and the `tests/cases` A/B all 0 differ.
