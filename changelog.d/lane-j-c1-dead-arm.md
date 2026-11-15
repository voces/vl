## Type system (Track A)

- **A test in a generic caller declared below its first call is decided per instance:**
  `c2("q", true)` before `function c2<T>(…) { const v = w(t, b); if !(v is i32[]) { … } }`
  trapped, because the quiet check that reached `c2` from the call marked the arm dead. A dead
  arm is now recorded only by a check whose types stand. Four declaration-order cells stop
  moving (D16301).
