## Codegen, memory & runtime (Track B)

- IR coverage, bare-literal record fields (lane IR-M1). A field typed by one string literal now reps at the storage of the row its record is stored at (`rowFieldStorage`), the string where an anonymous literal built from a binding keeps it. A row that changes an answer after a rep was built from it fails the emit. D17069 pins the function-field half, which is still decided per row.
