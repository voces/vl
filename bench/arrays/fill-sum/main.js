// fill-sum — allocate an i32 array of N, then ROUNDS rounds of (fill in place, sum).
const N = 2_000_000;
const ROUNDS = 200;

function run(n, rounds) {
  const a = new Array(n).fill(0);
  let total = 0;
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < n; i++) {
      a[i] = (i + r) & 65535;
    }
    let s = 0;
    for (let i = 0; i < n; i++) {
      s += a[i];
    }
    total += s;
  }
  return total;
}

console.log(run(N, ROUNDS));
