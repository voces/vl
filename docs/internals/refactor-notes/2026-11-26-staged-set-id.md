# IR: a function set's id staged below a valued `if` (lane COV-CLOS, 2026-11-26)

An operand written before a valued `if` among one node's operands is staged as a temp below the
`if` (`irBStageLeads`), typed by `stageTyOf`. A function set's id is an immediate at the id rep,
which the operand's checked type (a function type) does not name, so it had no staged type and the
node missed `staged literal type`. The temp is now typed at the id rep's own type (`repTyOf`),
which names that rep by construction.

## Measurements

MEASUREMENTS_PLACEHOLDER
