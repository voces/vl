## Infrastructure (Track F)

- **Review medium 6 designed** (docs): the checker's 276 arena writes are classified PRE (18
  functions), MID (52) and POST (19); PRE becomes a resolve-time `lowerResolved` pass, POST retires
  into L1's builder at I9, and L5 step 5's deletion is gated on I9. A redirect in `nodeAt` was
  measured at +2.27% fuel and rejected.
