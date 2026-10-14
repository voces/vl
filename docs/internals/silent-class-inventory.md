# Silent-class inventory — SPLIT, one file per row

**This file is a pointer.** Its 506 rows now live one per file under
[`inventory/`](./inventory/), because every defect PR appended to this file's tail and two
concurrent PRs conflicted there nearly every hour.

* one row, by id — `docs/internals/inventory/D1042.md`
* the whole list — `vl run scripts/inventory/ls.vl -- docs/internals/inventory`
* which rows are non-running — `vl run scripts/inventory/ls.vl -- docs/internals/inventory --status open`
* filing a new row — [`inventory/TEMPLATE.md`](./inventory/TEMPLATE.md)
* the prose that used to sit around the rows — [`inventory/README.md`](./inventory/README.md)

The path is KEPT rather than deleted so the ~60 citations that name it, and any link from
outside this repo, still resolve.
