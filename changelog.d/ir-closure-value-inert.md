## Codegen, memory & runtime (Track B)

- **IR: open function types in a build with bundles:** an open function type held at the uniform closure rep now counts as held in a build whose only records of closures are bundles; a bundle parameter is read only at a member pick, and an argument handed into a bundle parameter stays legacy's. Byte-identical; armed `tests/cases` covers 99 more functions, all matching.
