## Infrastructure (Track F)

- **The I8 lists are one file per entry:** `scripts/ir-i8-census/keep/<fn>`, `causes/<cause>` and `edges/<caller>--<callee>` replace `keep.txt`, `sweep-baseline.txt` and `edges-baseline.txt`, so a port PR that drops a cause or an edge deletes its own file and no longer conflicts with the next one on a shared line. `ir-i8-sweep.sh` reads the directories, `--grow` adds keep files, and `--write-baseline` adds and deletes files.
