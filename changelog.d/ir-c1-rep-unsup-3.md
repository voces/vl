## Codegen, memory & runtime (Track B)

- **IR coverage, `rep unsup` batch 3:**
  - A capture read whose own type is open (a lambda in a generic body reading a captured `T`) is at the kind legacy stores the capture at.
  - A member read off a hole parameter held as a nullable box (`?.` over `A | B | null`) takes the box `?.` narrows it to as its receiver.

  tests/cases `rep unsup` goes from 18 functions to 9.
