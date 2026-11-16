## Type system (Track A)

- **D16755 closed:** a relay of a generic maker (`function deliver() { return mk() }`) delivered
  at function types whose results differ is built per delivered result, as the maker is, and each
  twin returns its own maker call at its result; one shared call reached one instance and trapped,
  or was a loud emit reject. `generic-relay-two-results` runs 51 of 66, up from 0.
