## Infrastructure (Track F)

- **The filed-witness grader tells a checker trap from a refusal.**
  `check-filed-witnesses.vl` graded every non-zero `vl check` as `check_reject`, including the
  compiler trapping inside the checker (exit 70, with the banner). So a compiler trap at check
  stage could sit in the inventory as an ordinary refusal. It now grades as `compiler_trap`.
  One row was hiding: D12131 (the checker exhausts its stack on `type L<T> = { v: T, next:
  L<L<T>> | null }`), now filed as a compiler trap.
