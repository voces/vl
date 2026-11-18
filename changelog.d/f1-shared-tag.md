## Type system (Track A)

- **D16956 closed:** a field read across record arms whose shared field is a nested boolean list in one arm (`({f: i32} | {f: boolean[][]}).f`), nullable or not, answers `is` against its own type, where it answered false.
