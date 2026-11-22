## CLI (Track C)

- **`vl test` reports what a file's top level prints** (#1346). It was dropped; it is now the file's own `--- top-level output ---` block, shown when the file has a failure or under `--show-output`.
- **`vl test --no-capture` and `--json`** (#1347). `--no-capture` streams each test's output to stdout under a `=== RUN` line, one test at a time, for a test that hangs. `--json` writes the results as one JSON document, every test's output included.
