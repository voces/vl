# Step 7: classifier group 3, `forInVarStructIdx` reads its binding's cell row, 2026-11-10

Group 3 of `2026-11-09-step7-classifiers-remaining.md` is function-value list rows. This PR takes
its smallest member, on master `0cee4409`. `forInVarStructIdx` was kept probed by one fallback,
and it is switched. Probed classifiers go from 22 to 21.

**The one fallback.** Round 26 switched every arm of `forInVarStructIdx` to the iterated list's rep
row (`listRowOfExpr`) or its element type's slot, except one. For a list of lists where
`listRowOfExpr` finds no row, the ref-list arm still asked the whole `refListSlotOfExpr` ladder.
Over the 23,829-program sweep population, that fallback is reached by one call, in
`closures/hole-fn-list-reached-through-alias-called-in-callback.vl`:

    const a2 = [inc0, dbl]
    let b2 = [inc0, dbl]
    b2 = a2
    ...
    const ws = [[inc0, dbl]]
    for w in ws { print(w[1](5)) }

The re-pointed `let` leaves `inc0` and `dbl` as hole functions, so `ws` is typed
`((_) => _)[][]`. It has no stored rep (`exprRepTy` -1, no `heldRepOf` stamp), and the intern pass
minted no row for the literal (`arrLitRlSlotAt` -1). The ladder's answer, row 1
(`((i32)=>i32)[]`), came from its kept-slot rung, `declaredRefArraySlot`. That is the slot the local
registry gave `ws`'s cell, which is the emitter's own storage.

**Switched.** The fallback reads `declaredRefArraySlot` for an identifier and nothing else. The
shadow agrees in 1 call of 1. The fixture's wasm is byte-identical with master's. The census lists
`forInVarStructIdx` under `STORAGE_READERS`, with that reason.

**Tried and dropped: the intern pass's minted row as `listRowOfExpr`'s fallback.** Where
`exprRepTy` gives no type, `listRowOfExpr` could read the row `arrLitRlSlotAt` minted for the
literal that built the value, directly or through an un-annotated binding's initialiser. Shadowed
against `refListSlotOfExpr` at every call where `listRowOfExpr` misses today:

| outcome | calls |
| --- | --- |
| minted row equals the ladder's | 10,740 (10,362 at a hole-typed list, 378 closed) |
| minted row differs | 4, in 2 files, all at `((U) => void)[]` inside a generic instance |
| no minted row | 11,501 |

Guarded against a declared type parameter, it agrees wherever it answers. It does not reach this
PR's case, though, and it removes no ladder rung, so it is not shipped. To delete
`refListSlotOfExpr`'s and `refListKeptSlotOfExpr`'s ladders, the 11,501 unminted calls need a row
recorded where the literal is built. A guard on `tyHasTyVar` is the wrong one here: inference holes
are `TyVar`s, so it refuses every hole-typed literal.

**Proof.** The fixpoint seed is byte-identical over two `refresh-compiler.sh` runs: 6,600,173
bytes. Seed size is +0.2%. Late demands are 6, the baseline. rep-fuzz is exact, and lint-self is
clean. The `cases_wasm` shards pass 7,397 with 0 failing. `check-filed-witnesses --strict` grades
all 4,684 rows as filed.
