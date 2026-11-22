## Codegen, memory & runtime (Track B)

- **IR lowering's recursion frame:** a tag dispatch's id stash lowers in its own helper (`tagStashEffect`), not inline in the per-statement recursion. The 600-level deep-nesting case's margin edge returns from 925 KB to 896 KB.
