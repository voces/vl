## Codegen, memory & runtime (Track B)

- IR re-entry `emitArmSiteAt` (lane COV-IS): an element, `.length`, `.has` or `.get` read through a union of lists or maps is now a statement, `SArmSite`, whose arms the IR builds itself. Legacy writes only the tag test and the payload cast. In the 32 rehearsal programs, no claimed function re-enters legacy (59 did), and 245 functions are claimed (193 before).
