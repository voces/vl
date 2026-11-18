## Type system (Track A)

- **D16603 closed:** an empty list a hole function allocates and hands to its own callback parameter is fresh per call, so a second callback at another element type runs (`const a = []; return h(a)`); a module-level, record-nested or relayed list, and `Map()`, stay shared.
