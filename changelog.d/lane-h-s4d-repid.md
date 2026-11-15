## Infrastructure (Track F)

- **A type's rep id, `tyRepId`** (type hash-cons stage 4d): the layout id with a record's union-arm
  status folded in at every depth, for lane E's `repOf`. It replaces `tyCanonLayout`. Graded
  one-way against the rep tree, it leaves no merge in the corpus; the layout id left 20.
