## Type system (Track A)

- **D16745 closed (clause 1):** a function with an un-annotated list parameter, called with lists of functions whose sets nest one inside another, no longer builds an invalid module. The smaller list's instance is pinned at the larger set's ids, as the caller builds it.
