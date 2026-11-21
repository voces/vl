## Testing

- **IR shadow rows, one file each:** `tests/vl_ir_shadow_test.ts` also grades every `tests/ir-shadow-rows/<slug>.vl` (a name line, `// expect` count and absence lines, then the program), so coverage PRs adding rows no longer conflict on the shared test file; a tripwire fails a name that is both inline and a file, and controls prove a bad directive and an unmet expectation each fail. Inline rows are unchanged.
