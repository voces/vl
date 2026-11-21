# IR: a hole function stored in a record field, at the closure rep the record holds, 2026-11-21

`object field coercion` was the second-largest corpus class: 61 functions at master `568e22a36`,
59 of them with no other blocker. A scratch probe named each miss's value rep, kid rep and field
kind; 58 were `closure → closure` on a struct `closure` field.

Grouped by originating grid, they are one shape, from the d15113, d15115, d152xx and d16221 named
sets. An un-annotated (hole) function is used as a record field's value and called through it:

    function g(a) { return a }
    print({ f: g, n: 1 }.f(true))

## The mechanism, measured

The name `g` records the hole function's own open type, so its closure rep is H. The field is
the instance's, `(bool) => bool`, at rep I. `deliver` built a closure value at its destination's
rep only for a name that records no type, so `g` was built at H and missed.

The disassembly of d15113_hole_bool_str_twoD_fn_bare shows that legacy calls each instance at its
own signature:
- the bool call is `call_indirect (type (func (param structref i32) (result i32)))`;
- the string call is `(param structref (ref $str)) (result (ref $str))`.

So the field holds I. The IR's call signature already comes from legacy's `callRefPlainKey`, not
from the callee's rep.

## The change

One predicate, `holeCloTy(t)`: `irTyOpen(t)` and a closure rep. The openness test is IR-D1's, so a
change to it moves both uses. No type source (`nodeTyAt`, `scopeTyAt`) changes.
- **Write.** `deliver`'s untyped-closure arm also takes a `holeCloTy` name, built at the field
  kid's rep. Its temp is typed at that rep's own type wherever the row's site type, which another
  instance sharing the row may have set, is not it.
- **Read.** `buildMember`, for a `holeCloTy` read, builds the receiver first and reads the closure
  at its built record kid (`repNodeKids(irBOpRep(rv))[k]`), typed `repTyOf`.

The coordinator ruled on the measurement; IR-D1 confirmed the rule does not overlap
`irTyHeldOpen`.

## Readings (merge-base `568e22a36`, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| corpus functions with no blocker | 44,577 | 44,685 (+108) |
| corpus `object field coercion` (alone) | 61 (59) | 3 (2) |
| self-compile functions with no blocker | 19,539 | 19,539 |
| tests/cases armed shadow covered / matched | 65,085 / 65,084 | 65,326 / 65,325 (same single fail row) |
| L2 self-compile fuel | 107,527,479,925 | 107,540,926,816 (+0.013%) |

The corpus gain is larger than the class, because each cell's start function clears with it.
The 3 left are a reflist field, a nullable record field, and a node-in row.

Legacy lines deleted: 0. Moved to `@ir`: 0.
