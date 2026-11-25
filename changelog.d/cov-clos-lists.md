## Codegen, memory & runtime (Track B)

- IR coverage, spread sources (lane COV-CLOS): a spread source whose list is the literal's own list apart only in a hole, such as a list of a generic function spread into an instance's closure list (D16695, D16698), is now claimed. Filed D17580: in the second instance, a spread copy of such a list built as a record field traps (legacy, claimless alike).
