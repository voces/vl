## Testing

- **Inventory D17052: its witness comment no longer reads as a `// PRINTS` line.** The grader compares a `PRINTS` line with the whole stdout verbatim, and "true then false" is not it, so the open row graded `wrong_output` and reddened master's filed-witness step. With its `Want:` block alone, the row grades `silent_wrong_value`, as filed.
