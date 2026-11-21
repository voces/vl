## Testing

- **The IR shadow's door probe allocates from legacy's starting scratch frame:** a list literal of an order-stashed record (`[{ v: 2, f: () => 11 }]`) read as a byte `differ` at the door because the probe allocated its stash slots after legacy's; the probe now starts from the frame legacy began with, so the census's 6 `node-in` differs and two armed start-body mismatches read matched. Shadow only; no shipped byte moves.
