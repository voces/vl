// struct-soa — STRUCT OF ARRAYS traversal; the parallel-arrays twin of struct-aos.
const N = 1_000_000;
const ROUNDS = 500;

function run(n, rounds) {
  const xs = [];
  const ys = [];
  const zs = [];
  const ws = [];
  for (let i = 0; i < n; i++) {
    xs.push(i & 1023);
    ys.push((i * 3) & 1023);
    zs.push((i * 7) & 1023);
    ws.push((i * 11) & 1023);
  }
  let total = 0;
  for (let r = 0; r < rounds; r++) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      s += (xs[i] ^ r) + zs[i];
    }
    total += s;
  }
  return total;
}

console.log(run(N, ROUNDS));
