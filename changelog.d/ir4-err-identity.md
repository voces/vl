## Codegen, memory & runtime (Track B)

- **IR claims gate, refusals compared:** `scripts/ir-identity.sh --cases` now compares the first
  error line of each program that both the claims-on and the claimless seed refuse. It also
  builds every inventory witness filed as an emit reject under both seeds and compares them. A
  claim that turns a legacy refusal into a build, or into a different refusal, now fails the
  gate. The new `scripts/inventory/witnesses.vl` writes the witnesses of the rows filed under a
  given outcome. A test checks that the comparisons red on an injected bypass.
