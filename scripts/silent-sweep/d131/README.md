# The D131 grid, and its ablation

The 1,732-cell CONFIRMATION grid that closed `silent-class-inventory.md` **D131**. Kept
because the closing numbers in that document — **360 moved, 0 backward, 0 message-only**, and
the two-root split with DISJOINT moved sets — are only claims if the population cannot be
re-run.

```sh
python3 scripts/silent-sweep/d131/gen131.py /tmp/d131cells
python3 scripts/silent-sweep/d52/sweep52.py /tmp/d131cells <seed.wasm> /tmp/tsv/<name>.tsv --jobs 6
python3 scripts/silent-sweep/d111/ablate111.py /tmp/tsv base FULL A B
```

`sweep52.py` and `ablate111.py` are reused verbatim — using ONE grader and ONE reader across
this family is what makes the residues comparable. The grader's expectation is computed by the
generator, never by the compiler, so a module that loads and answers wrong grades
`wrong_value` rather than `runs`.

## Why a confirmation grid and not a discovery one

D131 arrived from the D111/D117 residue with its axis already isolated by four one-line
controls: a NOMINAL field reproduces it, it fires at `decl=nodecl`, `return o.h.r` RUNS, and
the same read at MODULE scope RUNS. This grid exists to MEASURE that combination and to carry
the negative controls — the two rows that already ran are in it precisely so a fix that moved
them would be visible.

The axis the row's own controls did NOT separate is the one the grid found: **the RECEIVER's
storage class**. A PARAM, a module GLOBAL and a CALL result as the receiver of the same field
read all RUN on master; only a LOCAL does not.

## The two roots

| root | where | what it is |
|---|---|---|
| **A** | `criClassify`, `compiler/emit_classify.vl` | the INFERRED result KIND. `exprNullableStruct`'s Member arm classifies a code-15 field read as the `(ref null $S)` it is, but resolves the receiver through `structIndexOfExpr`, whose Ident arm reads `declaredStructIndex` — a table `buildLocals` fills long after the GLOBAL return pass. A LOCAL receiver is invisible, so the slot kept its `"i32"` default: `expected i32, found (ref null $type)`. |
| **B** | `emitReturnValue`, `compiler/wasmEmit.vl` | the RETURN BOUNDARY's missing recover. A kind-9 read deliberately stays the raw `(ref null $S)` and the USE site recovers; a field access, a call ARGUMENT, an annotated `let` initializer and a nested-struct field STORE all do. The return into a non-null struct result never grew the recover: `expected (ref $type), found (ref null $type)`. |

B is **not** a second spelling of A. Its own control has no field read at all —
`function pick(p: Circle | null, d: Circle): Circle { if p != null { return p } return d }` is
check-clean invalid wasm on master — and it fires at a PARAM receiver, where A never does.

## The ablation

Measured against master **`89f88840`** (fixpoint 1451224 bytes). **Stripping both patches out
of the merged tree reproduces `89f88840` byte-for-byte**, which is what says the two are the
whole compiler delta and that the `base` column is master and not an approximation of it.
Every compiler below is a proven self-compilation fixpoint built from that same master seed.

| compiler | what it adds | bytes | runs | loud emit | loud check | invalid wasm | moved | to `runs` | to SILENT |
|---|---|---|---|---|---|---|---|---|---|
| `base` | master `89f88840`            | 1451224 |  692 | 376 | 304 | 360 | — | — | — |
| `A`    | `criClassify`'s D131 rung     | 1452172 |  812 | 376 | 304 | 240 | 120 | 120 | 0 |
| `B`    | `emitReturnValue`'s recover   | 1451493 |  932 | 376 | 304 | 120 | 240 | 240 | 0 |
| `FULL` | both                          | 1452441 | 1052 | 376 | 304 |   0 | 360 | 360 | 0 |

The pairwise intersection is **EMPTY**, 120 + 240 = 360 = |FULL moved|, set-identical, and
FULL disagrees with neither single on any cell that single moves. `loud_emit_reject` (376) and
`loud_check_reject` (304) are **set-identical AND message-identical on all four compilers**.

### Which axes the two moved sets lie on — the mechanism, measured

```
A moved 120   ann {none:120}   recv {local:60, hop:60}      depth {d1:60,  d2:60}
B moved 240   ann {nonnul:240} recv {local,param,global,hop: 60 each}
                                                            depth {d1:120, d2:120}
```

A is `ann=none` × a LOCAL receiver and nothing else — `param` and `global` are ABSENT from its
moved set because they already ran, which is the receiver axis measured rather than asserted.
B is `ann=nonnul` and spread EVENLY over all four receiver storage classes, which is the
measurement that says it is receiver-blind. Both move `depth` 50/50 between `d1` and `d2`; the
`leaf` (`o.h.r`) and `mod` (module-scope) rows move **ZERO** on every compiler, which is the
row's own two running controls still holding. `claim=c0` moves 24 cells under A, which is the
`decl=nodecl` control still holding.

## The residue, filed rather than left

- **A DOCUMENTED DECLINE — all 376 `loud_emit_reject`, every one `field=arm`**:
  `emitProgram: only i32 / boolean / string / array struct fields are supported`. A struct
  field whose type is a union ARM has no supported lowering, and the message says so.
  376 on all four compilers, cell for cell, message for message.
- **DOCUMENTED DECLINES / GRID CONTROLS — all 304 `loud_check_reject`**: 208 are
  `'mk' infers the nullable return type … — type-valid, but an inferred return of this shape
  is not yet supported by codegen; annotate the return type`, the checker's own documented
  decline (the same one D111's residue lists); 96 are `return type mismatch: expected Circle,
  got Circle | null`, the checker correctly refusing a nullable field read into a non-null
  annotated result — the grid's own assertion that it still does. 304 on all four compilers,
  cell for cell.

## Re-graded populations

A backward count is a property of the GRID that produced it, so the three earlier populations
in this family were re-run against the same pair of seeds rather than carried over:

| grid | master `89f88840` | branch | moved | backward | message-only |
|---|---|---|---|---|---|
| D111/D117, 1,710 cells | 1157 runs / 16 loud emit / **24 silent** | 1181 / 16 / **0** | **24** | 0 | 0 |
| D52, 9,450 cells | see the table in `silent-class-inventory` D131 | | | | |
| D87, 3,144 cells | | | | | |

The D111 grid's entire 24-cell `invalid_wasm` residue — the population D131 was filed out of —
closes, and closes under patch **A alone**; patch B moves 0 cells on that grid, which is what
says each patch is inert where it is not the answer.
