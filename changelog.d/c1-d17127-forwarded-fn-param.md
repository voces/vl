## Fixes

- **D17127 (clause 1):** an un-annotated function handed through a forwarding parameter (`outer(f) { return mk(f) }`) into a record literal built with a closure field no longer builds an invalid module. The tag decision now follows a parameter handed on to another function's un-annotated parameter (`ftForwardStored`), along the call path, with a cycle stopping it. It covers 1–3 hops, a nested record, a named argument, a local alias, mutual recursion and an imported builder or forward.
