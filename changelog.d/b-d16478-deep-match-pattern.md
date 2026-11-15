## Type system (Track A)

- **D16478 closed:** a `match` type-pattern arm over a JSON-shaped union accepts the deep shapes `is` accepts (`match g { string[] => g.length, _ => 0 }` over a `Json`) and walks them as `is` does; it was refused as `not a member of Json`. A deep arm covers no member, so the `_` stays, and a target with no JSON shape gets the shape message `is` gives.
