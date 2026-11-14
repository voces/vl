## Type system (Track A)

- **D15357, D15392 closed:** a whole literal written into a held container is built at the holder's row. A list of records of an un-annotated function pushed whole onto a list of lists (`xs.push([{ f: id2 }])` onto `[[{ f: id1 }]]`), and a record written whole over a binding whose list field a list binding fills (`const xs = [id1]; let r = { f: xs }; r = { f: [id2] }`), now run at two call types where they were emit rejects. A list binding read again (D16242) and a field write of a list literal (D16243) are still refused.
