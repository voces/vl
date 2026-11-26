## Codegen, memory & runtime (Track B)

- **IR reads a record list at the row its ref-list slot lays elements out at:** take a list literal whose record element holds records of hole functions, like `[{ r: { f: inc0 }, s: { f: dbl } }]`. It is laid out at its slot's struct row (`rowRep`), not at the checked element type. Four places now take that row: a list local, an element read, a local bound to an element, and a walk's variable. A field read off any of them then reads by row. D17666 runs; its maker spellings remain as D17671 (records part).
