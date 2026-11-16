# Slot store, stage 2b part 2b(iii) B: a returned function reaches the caller's call (lane SLOT, 2026-11-16)

Part A ([`2026-11-16-slot-store-stage-2b-part3a.md`](2026-11-16-slot-store-stage-2b-part3a.md))
switched two elaboration readers. This PR switches `elabLamGenResultTy`, which 2b(ii) left on the
walk because a function returned through a function value's own result did not reach the
caller's call in the classes.

## What changed

- **`eplSlotParams(holder, path, k)`**: the parameters a slot is delivered at. That is its
  bound's, or else the one checked tuple its calls agree on (`eplSlotAgreedCalls`).
  `elabLamGenResultTy` reads it in place of `elabSlotDeliveries`.
- **A call through a function value yields what its members return** (`eplCallResults`, run
  after the edges are drawn). Take a call whose callee names no function, such as `f()` with `f`
  a hole parameter, and whose type may hold a function, here the hole `_`. Each member of the
  callee's class now flows its result into the call's place. The pass repeats while a new member
  reaches a call. A member that an instance minted after the write index is skipped: its frame is
  not filed, and reading it trapped the compiler on `d15551_bare_record_two` and
  `closures/generic-returned-litunion-to-string`, which the first gate caught. In `run(() => inc)`, `inc` now reaches `f()(5)`, and the read is delivered at
  `(i32)`, as the walk delivered it.
- **Each `elabRun` starts with fresh classes.** The tables were reset only by an ask after
  `elabSlotFacts` marked them stale. `elabLamGenResultTy` asks earlier, so a compiler instance
  reused for another program read the last program's classes. A batch `vl check` showed it: 27
  wrong answers in three files that were right when each file was checked alone. No earlier
  reader asked that early.
- **Named cells**: `slot2b3_retres_maker`, `_two_fns` and `_fn_param`, set
  `slot2b3-returned-through-result`. They are the three `tests/cases` programs where the classes
  answered nothing before this PR. They run on master and must keep running.

## Parity

A scratch build answered both the walk and `eplSlotParams` at every `elabLamGenResultTy` call
over `tests/` and the distilled corpus. It logged through a list `elabRun` does not reset; part A's
note says why. The control, which logs every call, counted 9 calls in 3 files. 0 differ. Before
the call-result pass, all 9 differed: the walk answered `(i32)` and the classes nothing.

## Readings

Fixpoint seeds: master `350eab14` with part A merged, and this branch, each byte-identical on a
second refresh.

| check | reading |
|---|---|
| distilled corpus, per cell | `regress.vl --json` byte-identical to master's; 0 runs → not-runs, 0 → silent |
| late demands | 2 in 2 files of 7,039 built: the baseline |
| seed size | 6,372,094 bytes against master's 6,370,173: +1,921 |
| L2 self-compile fuel | 90.765e9 against master's 90.717e9: +0.05% |
| `emit_mono` pin helpers | 908: untouched |
| `scripts/gate.sh` | every row ok but `ir shadow`: its one mismatch (`named/hash4h_rolled_alias_map`, prefix or locals at 0x34 vs 0x35) is the same on master's seed. That cell came from the hash-4h set, which master's IR-shadow baseline does not count |

Net: +86 compiler lines (107 added, 21 deleted).

## Next

B2: the `elabLitSlotCallees` family (`elabLitSlotCallTys`, `elabLitCallResultTy`,
`elab{Slot,Value}CallTysOpenFns`).
