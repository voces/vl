# A function list's hole binding

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4 on 2026-11-07; its `§` references are to that file.

#### A function list's hole binding: the type is right, a callback lambda shares (2026-11-07)

#6664 binds a hole pinned at its argument's bundle record at the argument's type. The function-list
rows of the same residue stay on today's binding, `i32[]`, a tagged set's id list spelled by its
storage. The binding is not the only obstacle; a refused candidate shows what else is.

**The set is a fact, and the instance key already carries it.** The checker's type of a list
argument carries the tagged set on its element (`fnTagSetOfTy` of the element of
`nodeTyFrozenOf(arg)`). The elaboration's closed identity type does not. Over 23,828 programs, 618
of them hand a set-bearing argument to an instance. They mint 1,364 instance keys, and **no key
serves calls whose argument element sets differ**. The key separates them by `#set<id>`
(`monoSetPinDiscrim`). Four keys serve two signatures, and each is two value-set arguments in
swapped order, members of one joined set the key names.

**The refused candidate (T3, named set `t3-fnlist-set-binding-price`, D15541).** The hole binds at
the list of `fnTagSetTy(set)`, with the set read by an emit_elab reader over `nodeTyFrozenOf`. On
its target rows it runs. Over the corpus it moves 5: two invalid modules and three wrong values.

- **One-member set returning `f64`:** `fnTagSetTy` gives an open `(_) => _`, so the `.map`
  result is typed `i32` and the module fails to validate.
- **Two one-member sets (`take3([inc0])`, `take3([dbl0])`):** the two `take3` instances stay apart,
  but both call one `.map` callback lambda, built for the first set. The second set's member is
  never instanced, and the second call prints the first set's result. On master each instance
  has its own callback lambda.
- **The lambda reuse is not only `monoListCbLamAt`.** That function pins the callback at
  `monoPinAnnSpelling(el)`, a spelling that cannot carry a set, and reuses any instantiated lambda
  whose spelling matches. Master never reaches it, because the element is `i32`. Skipping it for a
  tagged element leaves the three wrong values standing, so a second path still shares the lambda.
  Not yet ablated past that.

So moving these rows needs two things beyond the binding:

- a set type with the members' result, which `fnTagSetTy` does not give;
- a callback lambda keyed by its element's set, not its spelling. This is the same problem as
  the pin text the argument-pin arms carry (previous subsection: P10, B1 and B4 wait on the
  naming rule): a spelling used as a key cannot carry what tells two values apart.
