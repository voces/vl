## Infrastructure (Track F)

- **`check-filed-witnesses` reads the host's externs**: a witness declaring an extern function the native host does not provide is listed `not graded (extern: <name>)` instead of graded as invalid wasm, and does not fail `--strict`. The host's own refusal names the extern, so a program the host can load still grades. D2027 closes on that basis, with its Deno re-grade (the module loads and prints `2` once `exit` is provided) as the evidence.
