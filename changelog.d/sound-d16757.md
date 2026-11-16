## Type system (Track A)

- **D16757 closed:** a relay of a generic maker that nothing calls (`function deliver() { return
  mk() }` left unused) no longer withdraws the maker from building one instance per result; the
  maker's other deliveries called the wrong instance and trapped. An exported relay keeps the old
  answer.
