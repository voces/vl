## Codegen, memory & runtime (Track B)

- **IR coverage: a field typed by one bare string literal, read where its string is wanted.** Such a field is stored as its atom. Its read, off a plain record or a union member, now builds in the IR as legacy writes it: the field read at the atom, which the consumer decodes (a return, an argument, `print`, a string hole, a concat, a `push`). Families A and D of `member record`: 9 functions leave the class, 8 match and 1 moves to `member atom`. Legacy's bytes don't change.
