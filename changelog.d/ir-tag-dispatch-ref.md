## Codegen, memory & runtime (Track B)

- **IR: a tagged call's record, list, map or closure result:** a call through a tagged function set whose result is a reference builds in the IR, each arm's value as it stands under legacy's dispatch blocktype (`tagDispatchIfOf`). Byte-identical; in `tests/cases` the `tag dispatch result` blocker class falls from 110 functions to 70.
