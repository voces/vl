## Codegen, memory & runtime (Track B)

- **IR binds two more values as they stand, as legacy does** (`declaration coercion`). A list of lists or maps is the list of their nullable twins (`i32[][]` as `(i32[] | null)[]`), its backing already nullable. A union is one box in any member order, so a list of closures returning `Circle | Sq` is one returning `Sq | Circle`. Both are verifier predicates too; keyed self-tests pin the list case on both sides.
