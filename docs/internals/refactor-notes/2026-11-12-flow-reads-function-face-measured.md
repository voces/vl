# Flow-sensitive reads, the function-valued face: measured, 2026-11-12

This is the last face of the owner-ruled item "A read of a `let` takes its most recent write's
type". It was measured on master `682105de7`. This PR lands the measurement, the rows and a
matrix guard; the face's compiler change is not in it.

## D14930's premise is stale

D14930 said its witness ran only through `monoPinListElems`. With that function cut to
`return 0` at its first line, the witness and both of its pins still run and print their wants.
The row is restated.

## What runs on master

- The matrix template `fn-let-read-after-repoint.matrix.vl` runs 46 of 46 graded cells. Its
  setup is a generic seed re-pointed to a hole lambda, read at a closed `(n: i32) => i32`.
- These spellings run:
  - a re-point to a lambda, or to another generic, called at a new type;
  - a re-point at one signature, then read into a binding and a list;
  - the witness's `const h = k` and record-field reads.

## What the face still refuses

| row | spelling | refusal |
| --- | --- | --- |
| D15956 | `let k = plus; k(1); k = inner; k(true)` | `plus`'s body re-asked at `boolean` |
| D15956 | `let k = inner; k(true); k = plus; k(1)` | the later `plus` re-asked at the earlier call |
| D15956 | the hole-lambda spelling | the seed lambda's body re-asked at `string` |
| D15957 | `k = inner; const fs: ((b: boolean) => void)[] = [k]` | typed at the seed's `(V) => void` |

## Two mechanisms

- **D3968's re-ask (`fsbRecheckCalls`).** It re-asks at a call every function ever written to the
  binding, and the call's own constraint owner is the seed (`identFnAliasOf`).
- **The function set (`elabFnLetTy`).** The binding's type carries the set of every write, and a
  call through it makes an elaboration instance of each member.

## Prototypes (not landed)

**Hidden write rows.** A write to a binding marked by `fsbMark`, and its seed, installs a row
that reads do not take (`declTyOf` skips it). Only `fsbLiveTyAt` asks it, and the result filters
`fsbRecheckFrom`'s owners and replaces the call's constraint owner and named callee.
- Every master behaviour is kept: t1 to t6 and D14930 run.
- The D3968 refusal at the call goes away, but each of D15956's spellings is then refused in the
  seed's body, by the function set.

**Visible write rows.** The read takes the written function's type. Three programs that run
today became emit refusals:
- `let f = id; f(1); f = (n) => n; f("s")`: "the reassigned function binding `f` is called at
  more than one argument type";
- the same with a generic `dbl`;
- the D14930-style record-field read: "a function-value call has no interned signature".

## What the close needs

1. Narrow a read's function set to the writes that reach it: a straight-line write ends the
   earlier ones, a join unions them, and a loop head or a capture keeps them all.
2. Have the emitter lower such a read.

Both are in the singleton and finite function-set machinery (steps 3 and 4) and touch
`emit_mono`, so this is scheduled as its own lane.
