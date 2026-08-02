// push-growth — build an Array of N elements from EMPTY by repeated push, ROUNDS times.
const N = 1_000_000;
const ROUNDS = 200;

function run(n, rounds) {
  let total = 0;
  for (let r = 0; r < rounds; r++) {
    const a = [];
    for (let i = 0; i < n; i++) {
      a.push((i ^ r) & 1023);
    }
    total += a.length;
    for (let i = 0; i < n; i += 64) {
      total += a[i];
    }
  }
  return total;
}

console.log(run(N, ROUNDS));
