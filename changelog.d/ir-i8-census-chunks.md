## Infrastructure (Track F)

- **`ir-i8-census/census.sh` keeps each chunk's rows apart:** parallel chunks wrote into one pipe and long rows interleaved, garbling a few distinct-function names per run; each chunk now writes its own file.
