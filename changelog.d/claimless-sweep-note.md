## Testing

- **The claimed-vs-claimless discovery sweep is written down and rerunnable.** After D17048's fix, every program that runs under the claimless build also runs, and prints the same, under the default build: 203,836 of 250,438 census cells, 280 capability probes and 4,953 filed witnesses, with 0 hits. `docs/internals/refactor-notes/2026-11-22-claimed-vs-claimless-sweep.md` gives the commands, the control and the result; it reruns once on the I8 cutover candidate.
