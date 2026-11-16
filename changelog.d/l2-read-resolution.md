## Type system (Track A)

- **Mono's static read resolution, measured** (`refactor-notes/2026-11-16-l2-read-resolution.md`):
  1,849 reads mono asks across the corpus. The elaboration's answer for a call's callee is the
  same at check for 1,790 of 1,792. The proposal moves the query into the elaboration for check
  to ask, ahead of D16881's check-time refusal. No behaviour changes.
