## Codegen, memory & runtime (Track B)

- **IR: an open function type held at the uniform closure rep is held** (coordinator ruling, 2026-11-21). An unannotated lambda parameter or a generic function used as a value no longer keeps its function uncovered, in a build that makes no record of closures. The I8 census gains 208 claimed functions and 218 start bodies across the five populations. `--claimless` differs on 0 programs.
