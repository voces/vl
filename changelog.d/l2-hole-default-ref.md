## Type system (Track A)

- **Spec T9.5:** an unannotated parameter is an open hole; a function no call instances takes the hole's check default (`i32` when unconstrained). **D16927 filed (clause 1):** an uncalled function whose body constrains its hole to `string`, stored as a record into a map read back from a map, is built at `i32` and fails to validate. D16898 re-worded as stage 3's dependency.
