## Codegen, memory & runtime (Track B)

- IR coverage, constant cells (lane COV-START): a list of struct literals beside a same-layout twin record with a nullable field (D2938, D6731, D6772) is now built by the IR, each element at the list's element on their shared heap. An object literal boxed into a union whose arm is itself a union boxes as the variant its context names. Programs whose const cell still falls back to legacy: 7 → 0 of 27,421.
