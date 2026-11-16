# Two memos for self-compile headroom, 2026-11-16 (lane REP)

Coordinator ask: room under the +1% fuel tier for the in-flight PRs. The profile of master's L2
self-compile is flat by self time, so the search counted calls against distinct arguments for the
high-inclusive predicates:

| function | calls | distinct | inclusive |
|---|---:|---:|---:|
| `sameVariantTy` | 5,421,366 | 12,673 pairs | 2.32% |
| `repOfTy` | 5,450,583 | 33,020 types | 2.50% |
| `readRepOf` | 1,125,431 | 177,349 | 2.29% |
| `exprString` | 245,485 | 154,419 | 1.88% |

## The memos

- `sameVariantTy` (check_relate_core.vl): outside an `assignable` walk (no assumed pair), a pair
  of closed types (no type parameter, no inference hole) is answered once per `tyMutEpoch`,
  `cUserTypesVer` and literal relaxation (`nomLitRelax`), in a `PairMemo`. Both generations
  advance at every checker init, so a shared instance never reads a previous program's answer;
  the emitter-state audit names them (`LSTAMPED`).
- `repOfTy` (emit_rep.vl): one descriptor per type per rep-tree build (`rtGen`, which only rises),
  cleared in `repReset`. The canon shadow, which notes every read, asks each time. No caller
  writes a descriptor it is handed.

## Readings

| reading | value |
|---|---|
| L2 fuel, master 7de7196e2 (fixed seed, same method) | 97,580,676,917 |
| `sameVariantTy` memo alone | 97,200,199,118 (−0.38G) |
| both | 95,656,898,690 (−1.92G, −1.97%) |
| `self-compile-time.sh --write-baseline`, fixpoint seed | 95,669,702,349 (−1.48% on 97.11G) |
| corpus identity (`corpuscmp` vs master fixpoint) | 8,430 modules, 0 DIFFER, 0 LOST |

`readRepOf` (6x) and `exprString` (1.6x) repeat too little for a memo to pay for its state.
