## Type system (Track A)

- **D16710 closed:** a generic returned by a maker with an inferred result and relayed through a
  second inferred return (`function deliver() { return mk() }`) is built at the result the relay's
  calls are delivered at, through chains of relays; with the maker also used at another type it
  called that type's instance and trapped. `generic-two-result-pins-relayed` runs 66 of 66 (37
  cells were traps); D16755-D16757 are filed.
