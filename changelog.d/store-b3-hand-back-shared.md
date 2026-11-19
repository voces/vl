## Type system (Track A)

- **B3: the check reads a hand-back of several parameters one type parameter annotates:** the check's retry (`ftRetParamsOf`) falls back to `handBackShared` as the elaboration's hand-back does (D15461), and a `const` bound to such a call holds the set its arguments join to (`sbHandedBackSet`), so the call's set is retried at check; 7 late tag rows move (336 → 329).
