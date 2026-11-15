## Infrastructure (Track F)

- **`arena-write-after-lower` shares `literal-byte-write`'s line scanner** (medium 6 step 6.3
  follow-up): its node-field and lowering-function lists are packed strings, so the rule costs
  +84 compiler lines rather than +118; the count is unchanged at 259.
