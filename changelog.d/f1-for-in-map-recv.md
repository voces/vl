## Codegen, memory & runtime (Track B)

- **IR: a map walk over a receiver that is no global lowers:** a local, a parameter, a field read or a call receiver builds as the walk's operand, written where legacy's stash writes it and recovered by the shared `mapRecvRefTail`; one decision (`mapRecvGlobalIx`) sends a module global down the global read in both the builder and the lowering.
