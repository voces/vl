## Infrastructure (Track F)

- **The emit-refusal test hook works without legacy:** `--test-emit-refusal` now refuses inside the IR's claim (and claims are no longer skipped under it), so the position guards that use it keep measuring once the legacy emitter is gone; the probe grader skips the host's "an IR claim refused" note when it reads a refusal's reason.
