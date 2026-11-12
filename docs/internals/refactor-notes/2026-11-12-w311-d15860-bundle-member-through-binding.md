# D15860: a bundle member is found through the lambda the bundle holds, 2026-11-12

`bundleMemberFits` (`check_assignable.vl`) is the D15146 test that a destination fits one of a
bundle's call signatures. It looked the signatures up through the parameters of the function the
current call names. A call through a binding of the bundle (`w(3)` for `const w = g()`) names
none, so a constraint with no owner, such as `v: (f64) => f64`, was judged at `w`'s argument and
refused. That is an order dependence: the constraint exists only once `v` is checked. The test now
also takes the lambda its holes belong to (`?#L<n>`), the named function parameter that lambda is
handed to (`lap`'s `f`), and that parameter's calls, which are the bundle's signatures.

## Measurement

Fixpoint seeds on both sides, over the whole sweep population: same 23,987, bytes-only 0, output
movers 1 (D15860: check_reject → runs), runs → not-runs 0, new compiler traps 0.

The controls stay refused at check: a `(string) => string` annotation, and an `(f64) => f64`
annotation where the bundle is called only at `i32`. The reverse order is unchanged.
