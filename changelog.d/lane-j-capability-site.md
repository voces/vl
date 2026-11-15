## Type system (Track A)

- **D16440 closed:** a fresh list `const` spread into a list literal beside a part at a wider record (`[a, ...s]`, `[{ x: 2.5 }, ...s]`) is built at that record, as a spread into a push is. Before, the program built an invalid module. A spread no build reaches, such as a call's result list, is now refused at check with the shared-record contract (D16441). Filed D16441, D16442, D16443.
