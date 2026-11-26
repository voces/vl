## Codegen, memory & runtime (Track B)

- **D17665 closed:** a one-element list of a record holding two different un-annotated functions (`[{ r: inc0, s: dbl }]`) runs: the IR builds a function name typed at a tagged set's id into a slot its row stores as a closure as the function's closure, and calls a tag set's callee stored as a closure through that closure (lane COV-START). **D17666 filed:** the same list one record level down still builds an invalid module.
