# The I8 lists (`scripts/ir-i8-sweep.sh`)

One entry per file, so a PR that adds or drops an entry adds or deletes its own file and never
conflicts with another PR on a shared line.

- `keep/<fn>`: a legacy function stage B must neither empty nor propagate through; the file holds
  its reason. `ir-tail`: a tail the IR claim path calls (a claim fell back when it was stubbed).
  `ir-sentinel`: a helper the IR calls whose stub returns a sentinel, so the claim declines with
  its own reason. The plan is the CENSUS lane's; `ir-i8-sweep.sh --grow` adds files.
- `causes/<cause>`: the unexplained causes `--check` accepts, the file holding the cause text (the
  name is that text with every other character `_`). A cause not held reds; `--write-baseline`
  only deletes files. Counts are not graded (coordinator ruling, 2026-11-25).
- `edges/<caller>--<callee>`: the static edges into stage B `--edges --check` accepts; the files are
  empty. `--edges --write-baseline` adds and deletes files to match the tree.
- `owners.tsv`: the exceptions to the owner `red.sh` derives from a class's mechanism family, one
  `class<TAB>owner` line per class that family routes wrongly. `red.sh <census-out> <sweep-out>`
  joins `census.sh` and `ir-i8-sweep.sh keep --out` into the red list with the owner column. A new
  class routes itself; a line is added only when the coordinator rules against the family.
