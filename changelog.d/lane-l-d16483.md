## Codegen, memory & runtime (Track B)

- **D16483 closed:** `xs[i] ?? d` read straight off a cell of a list whose element is a nullable box (`(F32x4 | null)[]`) now runs as the null test it spells, where it was refused at emit. A side-effecting index (`xs[f()] ?? d`) is filed as D16484.
