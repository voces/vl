## Infrastructure (Track F)

- **`ir-only-census-ab.sh` runs its base arm over the base tree's own programs:** the base arm now restores `tests/cases/` to the base commit beside `compiler/`, so a program the candidate adds is not built by the base compiler (where it could fail and stop the census with "base census failed"). Files only the base held are deleted when the head's tree comes back, and the script refuses untracked files under either directory at the start.
