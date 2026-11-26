## Infrastructure (Track F)

- **land-check names a missing deno:** before the merged-tree IR rows, `scripts/land-check.sh` says `LAND-NO: deno not found (needed for the IR shadow suite)` rather than an empty "suite reds" line. A failed shadow or suite step whose log has no matching row prints the log's tail.
