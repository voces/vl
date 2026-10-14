# Silent-class inventory #2 — SPLIT, one file per row

**This file is a pointer.** Its 17 rows now live one per file under
[`inventory-2/`](./inventory-2/), because every defect PR appended to this file's tail and two
concurrent PRs conflicted there nearly every hour.

* one row, by id — `docs/internals/inventory-2/D1042.md`
* the whole list — `vl run scripts/inventory/ls.vl -- docs/internals/inventory-2`
* which rows are non-running — `vl run scripts/inventory/ls.vl -- docs/internals/inventory-2 --status open`
* filing a new row — [`inventory-2/TEMPLATE.md`](./inventory-2/TEMPLATE.md)
* the prose that used to sit around the rows — [`inventory-2/README.md`](./inventory-2/README.md)

The path is KEPT rather than deleted so the ~60 citations that name it, and any link from
outside this repo, still resolve.
