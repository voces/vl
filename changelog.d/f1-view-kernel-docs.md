## Codegen, memory & runtime (Track B)

- **View indexing measured again (#9676, docs only):** on the current seed `x[i]` on a `std:buffer` view is inlined at `-O3` and costs hoisted base + check on P1.4's kernels. A view held in a module-level `const` still reloads its descriptor every access (2.18 against 0.82 ns/iter for the hoisted `*At` spelling), so webcraft P1.4 and `buffer-design.md` §M11 now name the multi-column kernel spelling: views as parameters, or the hoisted `*At` accessors. The codegen fix is planned after the IR cutover (`refactor-notes/2026-11-23-view-global-reload.md`).
