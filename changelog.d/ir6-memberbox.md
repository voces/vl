## Codegen, memory & runtime (Track B)

- **Faster: a field narrowed to one record member, delivered where its own union is owed, passes
  the field's box instead of unboxing and boxing it again.** `if z.h is B { show(z.h) }` with
  `show(h: A | B)` no longer allocates per delivery (a 20M-delivery loop: about 0.35 s → 0.07 s);
  a destination that would change the box's tags (a narrower union) still boxes afresh.
