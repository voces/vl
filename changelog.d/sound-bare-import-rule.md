## Self-hosting & modules (Track H)

- **A bare import specifier is refused as the rule it breaks.** `import { x } from "fmt"` now says `an import names a relative path ("./fmt") or a std module ("std:fmt"); a bare name has no meaning`, where it said bare specifiers were "not yet implemented". A written `.vl` is dropped from the offered spellings, and the `std:` one is offered only when it is a valid std name. A malformed `std:` specifier and a URL-like one each get their own rule.
