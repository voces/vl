// A live table of LIVE structs held for the whole run, plus CHURN short-lived
// struct allocations. See main.vl.
//
// Idiomatic JS: an array of object literals for the live table, one object
// literal per churn iteration. The raw sum stays under 2^53 (safe-integer
// range) for this N, so `| 0` once at the end reproduces VL's i32 wrap
// exactly — no per-step masking needed (the loop body is pure addition).
function main() {
  const live = 50_000;
  const churn = 75_000_000;

  const keep = [];
  for (let i = 0; i < live; i++) {
    keep.push({ a: i, b: i + 1, c: i + 2 });
  }

  let s = 0;
  for (let i = 0; i < churn; i++) {
    const t = { a: i, b: i & 7, c: 1 };
    s += t.a + t.b + keep[i % live].c;
  }
  console.log("sum " + (s | 0));
}
main();
