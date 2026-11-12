## Type system (Track A)

- **D15934 closed (cross-program leak):** a program checked in one `vl check --batch` instance after a program whose check stopped early no longer skips a record-storage refusal. The record solve's node-indexed queues are now emptied when a pass starts, not only at its end. This was the intermittent native-align failure of `soundness/error-literal-binding-built-wider-stored-beside-own-literal.vl`, which depended on how files landed on batch workers.
