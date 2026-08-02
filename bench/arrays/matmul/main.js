// matmul — naive dense N x N f64 matrix multiply, i-k-j order, over FLAT arrays.
const N = 600;
const ROUNDS = 3;

function run(n, rounds) {
  const a = [];
  const b = [];
  const c = [];
  for (let i = 0; i < n * n; i++) {
    a.push((((i * 31 + 7) % 97)) * 0.125 - 6.0);
    b.push((((i * 17 + 3) % 89)) * 0.125 - 5.5);
    c.push(0.0);
  }
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < n; k++) {
        const aik = a[i * n + k];
        for (let j = 0; j < n; j++) {
          c[i * n + j] = c[i * n + j] + aik * b[k * n + j];
        }
      }
    }
  }
  let s = 0.0;
  for (let i = 0; i < n * n; i++) {
    s += c[i];
  }
  return Math.trunc(s * 1000.0);
}

console.log(run(N, ROUNDS));
