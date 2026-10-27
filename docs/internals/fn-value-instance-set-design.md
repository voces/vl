# A generic function value's instance set, recorded by the checker

This note covers class (a) of the pins left after the S2 adoption slice (D14402). A generic or
hole function value that reaches no closed function type stays a polymorphic value, as it does
in TypeScript. Its instances are the signatures it is called at. Today the emitter derives
those signatures with its 0-CFA flow table and reads them back through 17 pin sites
(`monoSlotPinNameTys`, `monoPlacePinNameTys`, `fnFlowDeclPathPinTysOf` and their wrappers in
`compiler/emit_mono.vl`). This note asks whether the checker can record the set as a fact
instead, so that the emitter reads it rather than deriving it.

It builds on Decision 5 (`architecture-target-2026-10.md`) and on `fn-value-flow-design.md`
§(d) and §(h). Decision 5 says `Fn#d` is a singleton type carried forward through literals,
bindings, returns and fields, and rejects backward propagation. §(d) gives the typing half to
the checker. §(h) asks for one checker-side store shared with the per-call binding column.
Nothing here reopens those.

**Measured against master `c7baf1103`.** The population is the 73 test files that stop
running when all 17 pin reads are removed (build A) and run with them (build C). Every file
was minimised by greedy line removal. A removal was kept only while C still ran and A kept its
outcome.

| class | files | what carries them |
| --- | ---: | --- |
| (a): no closed destination, the set is the call signatures | 70 | this note |
| (b): an un-annotated function returning a generic, delivered to a closed type (D14403) | 2 | stays pinned, by ruling |
| mixed: both, in one file | 1 | (a) for one part, and `monoRetGenWidePins` for the other (§5) |

## 1. Can the checker produce the instance set as a fact?

**Yes, and the structure already exists.** It is the `Fn#d` set machinery in
`compiler/check_elab_cap.vl`, together with the per-call binding records.

* `elabFnSetTy` maps a function type index to an interned set of declarations and lambdas.
  `elabFnValNote` is called at every read of a function's name (`typecheck.vl`, the `Ident`
  arm) and at every lambda literal, whenever the signature is open. `elabFnJoinTy` unions two
  sets where values join. `elabLiveTyOf(callFn)` gives the callee's type in the running
  instance, so a call inside an instance re-check reads that instance's set.
* `callBindNote` (`check_bind_rows.vl`) records the parameter bindings of every call through
  `elabCallNote`, keyed by call node and instance. `fnTagCallNote` (D3975) already records,
  for every call through a set of two or more functions, the set id and the spelling of the
  call's parameter types.

The fact is then one relation: **the instance set of `d` is the parameter-type tuple of every
call, in the generic pass or at an instance key, whose callee's live type carries a set that
contains `d`.** `fnTagCallNote` already records this for sets of two or more. Extending it to
singleton sets and storing it per member gives the emitter a table to read in place of the
flow pins. The direction is forward, as Decision 5 requires. The set travels with the value's
type, and the call reads it.

**The candidates in the brief are the wrong direction.** `recFnValueOrigins` and
`recFnValueLeaves` (`check_type_shape.vl`) and the `recPend` queue (`check_rec_rows.vl`) walk
backward from a delivery to its record origins, and `recPend` judges records only
(`tyHoldsObj`). Hanging the call set on them would rebuild a backward flow, which Decision 5
rejected. The hole-callee arm of `checkCallOnFuncTy` is no store either. It records
`noteMemCstr(fnTy, OP_CALL_PIN, ix)`, and `memCstr` dedupes by owner, property and hole type,
so a second call on the same hole is dropped.

**Today the set reaches 34 of the call sites in the 70 files.** A probe compiler (scratch only,
never a seed) printed, at every call whose callee is not a named function, the callee's live
set and the instance key.

| result at the call | files |
| --- | ---: |
| R: the set reaches the call and is complete | 34 |
| P: the set reaches the call but misses members | 15 |
| N: no set at the call, or no call to read | 20 |
| not probed (an expected-error file) | 1 |

The P and N files name what the forward carry is missing. These gaps are the preconditions
for building, in the order of the files each one holds:

1. **A list literal's element type keeps only its first element's set.** `[inc0, dbl0]` reads
   `{inc0}`, and `[apply2, apply3]` reads `{apply2}`. The element join does not call
   `elabFnJoinTy`. Together with gap 2, it accounts for the 6 P files in bucket E.
2. **A write into a set never joins it.** This covers `push`, an index store, a field store
   through an alias (`rd.f = idd`), and a `let` written inside a nested function. `fnLetSet`
   (`elabFnLetMembers`) computes a `let`'s whole set from its initialiser and each write, but
   only the D3975 disagreement judge reads it. A call through the `let` reads the
   initialiser's set. Besides E, this holds the 6 P files in W, the P file in F and the P file
   in D.
3. **A `break` value of a labelled block never joins the block's set.** This affects 4 files
   in bucket D.
4. **A type-parameter-typed parameter with no elaborated instance key has no set.** This
   covers `mid<F, G>(a: F, a1: G)` and a choice passed as an argument. It affects 5 files in
   bucket H.
5. **A rewritten `let` resolved as an alias of its initialiser** (`lookupFnAliasNode`). The
   call reads the initialiser's name, not the binding's set. This affects 3 files.
6. **A call before a module binding's declaration** reads no set. This affects 1 file.
7. **A `match`-bound binding of a choice reads an empty set**, while the choice it binds
   carries the right one. This affects the P file in K.

The two N files in E are not yet attributed. One shows no call line at all, and the other
reads an empty set at an element read.

None of the seven needs a new table. Each one is a join site or a read site that does not yet
call `elabFnJoinTy` or `elabLiveTyOf`.

## 2. The 70, by delivery shape

A file goes in the bucket of the delivery its minimised witness needs. The pin sites are the
ones whose removal alone makes the file stop running.

| bucket | delivery shape | files | R / P / N | pin sites it needs |
| --- | --- | ---: | --- | --- |
| D | an immediately called result (`pick()("a")`) | 10 | 5 / 1 / 4 | `monoIfBoundRetAtPin` and its caller in `monoCoerceRetAtPin` |
| K | an un-annotated `const` or binding, read only | 16 | 14 / 1 / 1 | `monoHoleGenFnFlowTy` (13), `monoCallIfBound` (2), `monoIfBoundRetAtPin` (1) |
| W | an un-annotated `let`, written, also through a capture | 12 | 0 / 6 / 2, and 4 with no call | `monoCellPinNameTys` and the `monoWalk` stores, `monoPinWidensTo` |
| H | a hole or type-parameter parameter | 20 | 13 / 0 / 6, and 1 not probed | `monoHoleGenFnFlowTy` |
| F | a record field | 3 | 2 / 1 / 0 | `monoPinRecordField`, `monoDeliverLitAt`, the `monoWalk` Member store |
| E | a list element | 8 | 0 / 6 / 2 | `monoPinsAtElemParams`, `monoNotePushDeliveries`, the `monoWalk` element store, `monoDeliverLitAt`, `monoCoerceLitPart`, `monoHoleGenFnFlowTy` |
| C | a closed destination past a hole parameter | 1 | no call | `monoHoleGenFnFlowTy` |

The smallest witness per bucket follows. Each one runs on master. With the pins removed, W
traps with `indirect call type mismatch` and the others are emit rejects (`cannot take the
generic function ... as a value`, `reaches no call that fixes its type`, or H's `unsupported
argument type`).

**D**, from `tests/cases/closures/hole-fn-if-bound-returned-called.vl`:

    function exclaim(s) { return s + "!" }
    const on = [1].length == 1
    function pick() {
      const x = if on { exclaim } else { exclaim }
      return x
    }
    print(pick()("a"))

**K**, from `module-fw-binding-read-beside-generic-body-at-two-types.vl`:

    function fw(f) { return f }
    function id(x) { return x }
    const q = fw(id)
    print(q(7))

**W**, from `module-binding-one-call-type-written.vl`:

    const c = (y) => y + y
    const e = (y) => y + y + y
    print(c(4))
    let d2 = c
    function w1(): i32 { d2 = e; 0 }
    w1()
    print(d2("b"))

The probe reads `d2("b")` as `{c}`, without `e` (gap 2). Four W files are different in kind.
The `delivered-alias-*` files deliver the written `let` to a closed destination, as in
`mk(d, 4)` or `const g: (y: i32) => i32 = d`. That is adoption of a `let`'s whole set, not a
call set, and it is served by gap 2 together with S1's adoption.

**H**, from `tests/cases/generics/typaram-binding-seeded-from-another-typaram.vl`:

    function same<T>(k: T): T { k }
    function mid<F, G>(a: F, a1: G) { let b: F = a1; print(a("x")) }
    mid(same, same)

The hole-parameter form that does carry a set is `hole-call-of-generic-at-its-own-instance`,
which the probe reads at instance key 3 as `{orz}`:

    function orz<T>(v: T | null, d: T): T { v ?? d }
    function viaOrz(a) {
      print(a(null, 3))
      print(a(null, "s"))
    }
    viaOrz(orz)

**F**, from `hole-fn-record-relayed-to-param-field-call.vl`:

    function inc2(a) { return a + 1 }
    function t2(a) { print(a.f(3)) }
    function mk() { return { f: inc2 } }
    const xs2 = [mk()]
    t2(xs2[0])

**E** is D14402's own witness:

    function inc7(u) { return u + 1 }
    function inc8(u) { return u + 1 }
    const us = [[inc7]]
    us.push([inc8])
    print(us[1][0](3))

**C**, from `generic-hole-fn-value-pinned-past-hole.vl`:

    function id<T>(x: T) { x }
    function sel<F>(f: F) { f }
    const k: (x: i32) => i32 = sel(id)

C has no call. Its destination is closed, so it is S1's adoption reached through a
type-parameter identity (`sel`). It belongs to adoption, not to the call set, and it is listed
here only because the hole-parameter pin carries it today.

`tests/cases/functions/error-generic-fn-value-two-type-param-params-read-elsewhere.vl` is in H.
It is an expected-error file, so the probe could not run it.

## 3. Zero call sites, and call sites the checker cannot see

**Zero call sites.** No instance is ever executed, so any instance is sound. The honest
fallback is the D4551 default binding (an unbound type parameter defaults), building one
instance that nothing calls. Today the emitter refuses instead, with `reaches no call that
fixes its type`. That refusal names a mechanism rather than a contract, so it is a clause-2
violation by the CLAUDE.md test. With the set recorded, an empty set is the checker's
knowledge, not a guess, and the default is safe.

**A call the checker cannot see** can happen in two ways, and they get different answers.

* **An export.** An exported generic keeps its generic template, and an importer instantiates
  it at its own calls. An exported un-annotated binding that holds a hole function is the hard
  case. Its importer's calls are checked in another module, after this module's set is fixed.
  The honest fallback is a loud refusal at the export that asks for an annotation. Silently
  building the local calls' instances would leave an importer's call at a signature nothing
  built. Under the cross-module adoption ruling, adoption already crosses modules. The call set
  could cross them the same way, and until it does, the refusal is the floor.
* **An escape into an un-annotated container whose reads the checker cannot follow.** Every
  read through a container the checker types is a call it sees. The value is invisible only
  when the container itself escapes, by an export or into an aliasing write the aliasing
  decision already refuses (the c2 shape, a `push` inside `runAll`). So the fallback is the
  existing refusal at the escape point. Keeping the 0-CFA pin for these is the alternative, but
  that pin can see an importer no better than the checker can, so it is not more honest.

In neither case does a silent guess become correct. Either the set is complete, or the
program refuses where the set stops being knowable.

## 4. Which pins each bucket deletes

There are 17 sites. They are named by function, since line numbers move.

| bucket | deletes |
| --- | --- |
| D | `monoIfBoundRetAtPin`'s slot read, and its caller in `monoCoerceRetAtPin` |
| K | `monoCallIfBound`, and the `let`-frame and Call callers of `monoHoleGenFnFlowTy` |
| W | `monoCellPinNameTys`, the `monoWalk` `=` store (D3957), the capture-cell store, and `monoPinWidensTo` |
| H | the hole-parameter argument caller of `monoHoleGenFnFlowTy` |
| F | `monoPinRecordField`, and the `monoWalk` Member store; `monoDeliverLitAt` (D9340) is shared with E |
| E | `monoPinsAtElemParams`, the `.push` pin in `monoNotePushDeliveries` (D3867), the `monoWalk` element and field store (D3909), and `monoCoerceLitPart`; `monoDeliverLitAt` is shared with F |
| C | the closed-destination path through `monoHoleGenFnFlowTy` (served by adoption) |

`monoHoleGenFnFlowTy` itself goes only when K, H, E, C and D's loop-capture file are all
served. Its callers are the hole-parameter argument, a choice arm, a read through a `let`
frame, a Call, and the generic-return path. The last one belongs to class (b), so
`monoHoleGenFnFlowTyAt` may keep a residue even after this table lands.

**Two sites stay.**

* **The generic-return pin in `monoCoerceRetAtPin`** (its `monoSlotPinNameTys` read) carries
  class (b). D14403 now names its two remaining files. By ruling, return generalisation is not
  built for them, and the pin stays.
* **`monoRetGenWidePins` carries correctness, not only capability**, as §5 shows.

## 5. Why `monoRetGenWidePins` stays: a wrong value with the pins off

`tests/cases/closures/fn-value-generic-nullable-fn-param.vl` is the mixed file. Its (a) part
is `const vu = deliver(); vu(...)`, which the probe reads as the set `{g}` at the call, so it
is in bucket K. Its (b) part delivers an un-annotated function's generic result to a closed
type:

    function h<T>(f: (x: T) => T, x: T): T { f(x) }
    function deliverH() { return h }
    const vh: (f: (x: i32) => i32, x: i32) => i32 = deliverH()
    print(vh((x: i32) => x + 1, 2) * 10 + vh((x: i32) => x, 5))

Take the file with its (a) part removed and all 17 pin reads off. This line then prints
**36 where 35 is due**. The second call returns 6, which is the first lambda's answer, and
every other line agrees. The (a) part makes the whole file an emit reject, which hides this.
The four-line excerpt alone is an emit reject too, so the wrong value needs the file's other
lines. The wrong value follows from
removing `monoRetGenWidePins`'s read. It is check-clean and silent, so that pin is a
correctness floor for class (b), not a capability pin. It is not live on master, since the pin
is in place, so it has no inventory row. It is recorded here so that removing the pin is
graded on this line and not only on whether the file builds.

## What building it would change

* `compiler/check_elab_cap.vl` gets a per-member call-signature table, filled where
  `fnTagCallNote` is called today and extended to singleton sets.
* Gaps 1 to 7 (§1) each get a join or read site, in `check_calls.vl`, the list-literal and
  labelled-block arms of `typecheck.vl`, and the store arms that already call `cwFnValueTargets`.
* `compiler/emit_mono.vl` reads the table in place of the pin sites in §4, one bucket per
  slice, under the same bar as S1 and S2: no `runs → not-runs`, and the late count reported by
  source as it falls.
* The risk is the one `fn-value-flow-design.md` §(b) names. A set recorded at a type index
  must survive the pre-mono rewrites, and `elabLiveTyOf` is the read that has to hold at every
  instance key. Gap 4 is the place where it does not hold yet.
