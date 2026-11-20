## Codegen, memory & runtime (Track B)

- **IR: a valued `match` lowered to an if chain lowers:** every link of a valued if chain takes the head's rep and type, as legacy writes every link at the head's kind (`ifJoinPlanOf` of the head, read through `ifExprJoinVt`), and the checker stamps a lowered match's `is` and wildcard tests boolean beside its `==` tests (`matchCondStamp`).
