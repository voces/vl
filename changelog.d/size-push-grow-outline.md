## Codegen, memory & runtime (Track B)

- **A list `push` grows out of line:** the grow path moves into one shared `__grow_<row>__` helper per list shape, and the capacity test and append stay inline. A push site goes from 129 to about 72 bytes, the seed shrinks 7.6% (6.89 MB → 6.37 MB), plumb CPU falls 5.8%, and a tight push loop runs 6% faster.
