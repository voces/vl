## Codegen, memory & runtime (Track B)

- **IR coverage: a value `if` joined at a record or a map reference takes legacy's reference join.** `ifRefExpr` admitted only string and list joins and missed the rest as `expression if ref <kind>`. A `struct` or `map` join is now built like the others: the blocktype comes from `ifRefJoinOf`, through legacy's own `fbRefIfOpenType`. A `variant` join stays a miss until D17037's stash locals agree (self-compile +5 functions with no blocker).
