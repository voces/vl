## Infrastructure (Track F)

- **`ir-shadow.vl` reports a chunk that did not finish instead of running out of memory:** when no listed divergence needed a detail build, `subtract` copied the run's own broken-chunk list into itself until the GC heap ran out (`GC heap out of memory: no capacity for allocation of 2147483688 bytes`). It now prints `chunk did not finish` and exits 2. A regression test drives the script with a host that exits 70 on every chunk.
