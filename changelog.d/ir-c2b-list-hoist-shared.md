## Codegen, memory & runtime (Track B)

- **IR cutover C2b, the list-header hoist is shared:** the IR's while loop opens legacy's own
  list-header hoists, and a list read asks the live hoist row as legacy's does. The IR's
  build-time "maybe hoisted" refusal is gone. The shadow now matches 12,603 of 12,603 covered corpus functions (was 12,267), and
  claiming lists gives the unclaimed bytes over the whole corpus and the self-build. No emitted byte moves.
