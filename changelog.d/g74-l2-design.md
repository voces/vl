## Type system (Track A)

- **L2 design: inferred interfaces for un-annotated functions** (docs only,
  `docs/internals/l2-inferred-interfaces-design.md`). Each un-annotated function gets one scheme
  whose bounds are today's deferred demands (the 11 constraint tables and 15 derived-hole kinds),
  inferred once in callee-first order and checked at each call by one solver, with exports frozen
  at the module boundary. It maps the 34 bucket-(c) rows to the element that closes each, measures
  what retires, gives an eight-step migration and lists five owner questions.
