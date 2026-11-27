## Infrastructure (Track F)

- **I8 census counts an expected refusal apart:** a unit whose claim declined on the refusal its `@emit-error` case expects is `fnr` (refused), not unclaimed, and its duplicate `claim fell back` row no longer counts as a second unit; `class-programs.sh` routes by `red.sh`'s family rule (`family.awk`).
