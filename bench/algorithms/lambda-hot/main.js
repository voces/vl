// lambda-hot — the cost of CALLING, in a hot loop, in four spellings of the
// same function `(x) => (x + k) & 15`:
//
//   phase 1  inlined by hand (no call at all)      — the floor
//   phase 2  a named function                      — a direct call
//   phase 3  a non-capturing arrow in a local      — a call through a value
//   phase 4  an arrow that CAPTURES a local        — a closure call
//
// Idiomatic JS. V8 inlines all three call spellings once the loop is hot.
// The accumulator is a serial dependency and all values stay under 2^20, so
// no overflow rules are involved and nothing can be vectorised away.

function bump(x) {
  return (x + 1) & 15;
}

function main() {
  const n = Number(Deno.args[0] ?? 100000000);
  const mask = 1048575;

  // phase 1 — no call
  let a1 = 0;
  for (let i = 0; i < n; i++) {
    a1 = (a1 + (i & 15)) & mask;
  }
  console.log(a1);

  // phase 2 — direct call to a named function
  let a2 = 0;
  for (let i = 0; i < n; i++) {
    a2 = (a2 + bump(i)) & mask;
  }
  console.log(a2);

  // phase 3 — a non-capturing arrow held in a local
  const f3 = (x) => (x + 2) & 15;
  let a3 = 0;
  for (let i = 0; i < n; i++) {
    a3 = (a3 + f3(i)) & mask;
  }
  console.log(a3);

  // phase 4 — an arrow that captures a local
  const k = 3;
  const f4 = (x) => (x + k) & 15;
  let a4 = 0;
  for (let i = 0; i < n; i++) {
    a4 = (a4 + f4(i)) & mask;
  }
  console.log(a4);
}

main();
