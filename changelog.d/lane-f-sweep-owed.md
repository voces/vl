## Infrastructure (Track F)

- **The sweep accepts an owed refusal.** A clause-1 fix that turns a wrongly-running witness into a check refusal lists the cell in `scripts/sweep-owed.txt`. `sweep.vl diff` then accepts that one `runs → check_reject`, only for a row whose status says clause 1, and fails a stale entry (`scripts/sweep.md`, "Owed refusals").
