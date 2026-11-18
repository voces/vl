## Codegen, memory & runtime (Track B)

- **IR S1b, the start body claimed:** a single start body inside the IR's set now ships from
  the IR (`irClaimStart`, family `start`), written before legacy's and in legacy's frame. Its
  top-level rows (kind 1) are the IR's too, proved first by the shadow. Legacy's merge loop and
  the IR walk one `startMergeOrder`. The string accumulator, the progress cell and init-function
  windows stay legacy's, by name. No emitted byte moves.
