## Compiler internals

- **One classifier for the statements an operand is staged around (lane COV-UNION):** `stmtClassOf`, an exhaustive match over the IR's node kinds, replaces the hand lists in `ifBelowLeadHas`, `irBStageLeads`'s scanners and their helpers. No behaviour change; a new node kind can no longer slip past the staging decision.
