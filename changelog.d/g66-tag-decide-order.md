## Type system (Track A)

- **D16381 closed:** a call through a set of un-annotated functions declared after the call
  checks each member it needs first, as a forward direct call does, so the set is tagged and
  dispatched instead of trapping. Declaration-order clause-1 movers fall from 31 to 17 on top of
  #8165. Filed D16369, D16209's map store with its functions declared last. D16281 re-graded to a
  still-failing cell; filed D16420, a binding of a hole function called directly and then handed on.
