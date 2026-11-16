## Infrastructure (Track F)

- **The emitter's `tySame`/`tyEq` stay structural** (type hash-cons stage 4i, measured and not
  taken). Answering them from canonical ids changed no answer over 15,472 programs, but it costs
  +0.21% guest fuel on a fixed input, because those calls mostly exit early. The ids replace the
  comparers when L2 retires the checker's comparer families. The nine programs where an id splits a
  pair the comparer calls equal, all at recursive types, are the named set
  `hash4h-recursive-splits`.
