## Type system (Track A)

- **The resolve-time lowering runs once per program** (medium 6 step 6.1): `intrinsicValuesWrap`,
  `hoistMatchScrutinees` and `annotateTyArgLambdas` move from each checker walk to `checkProgram`,
  so a re-walk starts from the lowered tree. Byte-identical over 20,329 corpus programs and the L2
  build; net −2 compiler lines.
