// push-known-size — sunpa SP-036's 4x4 matrix product, building its result with `push`.
const N = 1000000;

function m4Mul(a, b) {
  const o = [];
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0.0;
      for (let k = 0; k < 4; k++) s = s + a[k * 4 + r] * b[c * 4 + k];
      o.push(s);
    }
  }
  return o;
}

function run(n) {
  let m = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0];
  const t = [0.999, 0.01, 0.0, 0.0, -0.01, 0.999, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.1, 0.2, 0.3, 1.0];
  for (let i = 0; i < n; i++) m = m4Mul(m, t);
  return Math.trunc(m[12] * 1000000.0);
}

console.log(run(N));
