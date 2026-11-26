## Infrastructure (Track F)

- A reference-typed parameter that the shadow respelling copies into a seed, then written, no
  longer builds an invalid module: its capture cell is built after the seed, which reads the
  argument (D17674, lane COV-CLOS). The IR claims it.
