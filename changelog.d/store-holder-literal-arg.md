## Type system (Track A)

- **One storage decider, literal arguments:** a list or record literal of functions handed straight to an un-annotated parameter is now read at the call's binding of that parameter, both at check and after the elaboration. The late re-decision changes the outcome in 248 programs, down from 262. Output is unchanged; three programs' wasm shrinks as sets built as closures are now tagged.
