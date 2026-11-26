## Codegen, memory & runtime (Track B)

- A function or lambda returning its hole parameter, which its caller holds at another record's row, returns it at that row, read at the call, bound, in a record field or through an `if` join (D17682's positions, clause 1). D17681 runs on master. A closure held in a field and called there stays D17682.
