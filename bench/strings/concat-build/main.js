// concat-build — see main.vl
const ALPHA = "abcdefghijklmnopqrstuvwxyz";

const N = 5000;
const REPS = 1000;

function main() {
  let total = 0;
  for (let r = 0; r < REPS; r++) {
    let s = "";
    for (let i = 0; i < N; i++) {
      const k = (i + r) % 26;
      s = s + ALPHA.slice(k, k + 1);
    }
    total = total + s.length + s.charCodeAt(s.length - 1);
  }
  console.log(total);
}

main();
