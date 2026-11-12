## Codegen, memory & runtime (Track B)

- **Step 7, struct name producers cut 1:** a value's or annotation's struct row is asked of its type alone (`structRowOfValueTy`, `structRowOfAnnTy(rec, ty)`); `structRowOfNameTy`, `structIndexOfTypeNameTy` and `repStructRowByName` are deleted. Identity on the corpus.
