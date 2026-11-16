## Type system (Track A)

- **D16780 closed**: a maker's hole lambda relayed by a generic or hole-parameter function (`function wrap<T>(x: T) { return deliver() }`) and delivered once at `(a: i32) => f64` kept its `i32` result and trapped. The call search now climbs out through an instanced function's return to its calls, admitting a call made at the root or one whose instance reaches the instance searched; the one-delivery spelling prints `0.5`. The two-delivery face is lane INIT's, to be re-filed.
