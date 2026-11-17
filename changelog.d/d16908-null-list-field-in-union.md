## Type system (Track A)

- **D16908 closed:** a list of only `null` in a record literal delivered into a union of that record and another type (`const g: {f: (i64 | null)[]} | string = { f: [null] }`) takes its element type from the record arm the literal is built at, instead of being refused for having none.
