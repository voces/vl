## Infrastructure (Track F)

- **The I8 tail names every lane:** `scripts/ir-i8-census/class-programs.sh` maps COV-UNION's classes (union compare, cast and staged reads; most `??` arms; optional reads; assignment values; arm stores) and the CENSUS lane's (the lead-staging family, other start-only classes, and orphans; a start-only `??` or union class is COV-UNION's), and the committed class lists are re-measured at master 0c946159.
