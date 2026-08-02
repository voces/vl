// struct-aos — ARRAY OF STRUCTS traversal (see struct-soa for the parallel-arrays twin).
const N = 1_000_000;
const ROUNDS = 500;

function run(n, rounds) {
  const ps = [];
  for (let i = 0; i < n; i++) {
    ps.push({ x: i & 1023, y: (i * 3) & 1023, z: (i * 7) & 1023, w: (i * 11) & 1023 });
  }
  let total = 0;
  for (let r = 0; r < rounds; r++) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const p = ps[i];
      s += (p.x ^ r) + p.z;
    }
    total += s;
  }
  return total;
}

console.log(run(N, ROUNDS));
