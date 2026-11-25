## Codegen, memory & runtime (Track B)

- IR coverage, box ladder (lane COV-IS): a `M | null` map delivered into a union that holds its map arm is boxed by the IR, through legacy's own writers (the box plan's new `nulMap` arm, byte-identical to legacy). The `box ladder` class drops from 39 to 30 functions over cases and witnesses.
