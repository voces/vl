## Type system (Track A)

- **Fixed a D16958 regression:** a `??` default over a read of a map a later round adopts runs again; the late-adoption assertion refused it as a closure miss, though the closure follows no such edge.
