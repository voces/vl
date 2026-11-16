# Slot store parity 4: an open value takes its instance's type at its edge (lane SLOT, 2026-11-16)

The fourth engine-parity rule for [D16768](../inventory/D16768.md). Mono's readers are still on the
delivery walk, so it changes no output. It is graded by `tests/cases` byte identity with master.

## What changed

- **`eplEdgeTyAt`**: an edge whose value the check typed open (a type variable, or a type reaching a
  hole, as an un-annotated parameter's) is typed by the value's type in the instance the edge is
  drawn for (`elabNodeTy`). Where that is a function type the edge copies, as for a written
  function type, instead of unifying the two places.

## Why

Witness (`list-seeded-by-hole-param-slot-written-with-named-fn`, reduced):

    function same<T>(k: T): T { return k }
    function dbl(x) { return x }
    function go(a) {
      const r = [a]
      r[0] = dbl
      print(r[0](3))
      print(a("x"))
    }
    go(same)

The union put `a` and `r`'s element in one class, so the call `a("x")` read as a call through the
list; the walk keeps them apart. With the class-reading part D readers the program is refused
("the elaboration records no reach of `dbl`"); with this rule it prints 3 and x.

## Readings

Fixpoint seeds: master `a9ae9324` and this branch.

| check | reading |
|---|---|
| `tests/cases` built, byte for byte | 0 of 7,853 differ |
| distilled corpus, per cell | `regress.vl --json` byte-identical to master's; 0 `runs -> not-runs` |
| L2 self-compile fuel | 93.770e9 against the 93.782e9 baseline: -0.0% |
| seed size | 6,436,728 against 6,436,572: +156 |
| `lint-self` | clean after `vl fmt -w` (seed byte-identical across the reformat) |
| `scripts/gate.sh` | every other row ok |

## Gap list

Part D candidate (`slot-2b3-d`, master `4e48a976` merged), `tests/cases` byte compare: 2 remain,
both same-output movers. `fn-record-returned-to-two-bindings-one-written` (the classes share a
non-generic function's returned record between its call sites) and `generic-returned-fn-param`
(the candidate builds one `app2` instance fewer). This rule and a D-only rule (a binding's own
closed function type is a delivery) closed `list-seeded-by-hole-param-slot-written-with-named-fn`
and `generic-list-written-fixed-fn-called-in-generic-body-widens`.
