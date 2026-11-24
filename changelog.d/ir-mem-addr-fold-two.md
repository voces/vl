## Testing

- **A two-fold witness for the IR's memory address fold.** `memarg-const-fold-two-folds-runs.vl` keeps two folded `const` addresses in one function and re-builds one in a loop, so a fold that took another fold's scratch slot reads the wrong cell; the single-fold witnesses could not see that.
