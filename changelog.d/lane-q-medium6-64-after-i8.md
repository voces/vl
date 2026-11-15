## Infrastructure (Track F)

- **Medium 6 step 6.4 scheduled after L1's I8** (docs): the 13 between-pass pin functions overwrite
  a declaration with a minted annotation; making them CheckRun facts would touch every annotation
  read (`letType` 488, `parType` 440, about 70% in the legacy emitter), so it waits for I8.
