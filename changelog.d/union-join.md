## Type system (Track A)

- **Union return joins grow linearly per return:** an annotated function's natural-return join and a shared-field read over a record union join only each new member against the running union, the Set/map clash test pairs only records that hold a map, and the literal-beside-base test reads scalar members by name. A function returning a union of 128 record types now builds at 528M guest fuel (was 2.29G before #8846, 1.27G after it). Self-compile −0.09%.
