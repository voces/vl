## Codegen, memory & runtime (Track B)

- **D16553 narrowed:** a program with no generic and one annotated higher-order function no longer scans the whole arena per call through a function-valued name, and walks only the bodies that call such a function: the compiler's own source with one added reads 91.81G L2 fuel, from 97.62G (89.58G without it), output byte-identical.
