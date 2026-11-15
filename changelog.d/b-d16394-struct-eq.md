## Codegen, memory & runtime (Track B)

- **D16394 closed:** `==` and `!=` over two records of one field set whose fields are stored apart (a literal union beside `string`, two number widths, a nullable beside a plain field, lists of another element, nested records, nullable records) compare field by field. Before, these were refused at emit or, for a nullable record, built an invalid module. Filed D16395 (records of different field sets, still refused at emit) and D16396 (field pairs that widen in opposite directions, refused at check).
