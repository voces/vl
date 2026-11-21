## Codegen, memory & runtime (Track B)

- **IR coverage: a literal arm over a temp receiver read once.** A literal-union `is` test whose receiver is a call or another computed value is built where legacy reads it once (one member, or a stashed or statically false box test), through the shared read count `litArmsReadsOf`. A receiver read per member stays a named miss.
