## Infrastructure (Track F)

- **The capability matrix and probes compare a want with the whole output, each line exactly.** Before, a want could be any substring of the output, so `-2147483648` graded RUNS against `2147483648`; `X twice` accepted one `X`; and only the last of several `// want:` lines counted. A re-grade of all 1,344 templates (76,702 programs) and 247 probes flipped 321 cells. Each one printed a correct line its want had left out, and those wants now name the whole output.
