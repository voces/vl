## Infrastructure (Track F)

- The IR dispatches a tagged set's annotated lambda member, which monomorphization does not
  instance, by its name, as legacy does (`tag dispatch lambda arm` → 0; lane COV-CLOS). A generic
  lambda with no instance for the call's signature is still refused, as legacy refuses it.
