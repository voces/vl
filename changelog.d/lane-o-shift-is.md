## Infrastructure (Track F)

- **The oracle models shift typing (Q8) and `is` on an empty container (ruling 4.4, #8222):** a shift's count never types its left operand, and a constant count of 32 to 63 widens an untyped left to i64; a container remembers the type it was built at (its annotation, or the first union arm an empty literal reached, through elements, fields and map values), and `is` on an empty one reads it, a never-delivered one matching vacuously. #8222's empty-container matrices go from 0-36 of 64 in the subset to 61-64 agreeing.
