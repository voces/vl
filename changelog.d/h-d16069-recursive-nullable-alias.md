## Type system (Track A)

- **D16069 closed:** a recursive record alias spelled with a top-level `| null` (`type LL = { v: i32, n: LL } | null`) builds and runs when a binding is reassigned from its own field, walked, or narrowed through an un-annotated field read; it built an invalid module. The generic spelling `LL<T>` runs too.
