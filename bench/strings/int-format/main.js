// int-format — see main.vl
const N = 30000000;

function main() {
  let totalLen = 0;
  let acc = 0;
  let v = 1;
  for (let i = 0; i < N; i++) {
    v = (v * 31 + 17) % 999983;
    let out = v;
    if (i % 5 === 0) out = 0 - out;
    const s = String(out);
    totalLen = totalLen + s.length;
    for (let j = 0; j < s.length; j++) {
      acc = acc + s.charCodeAt(j);
    }
  }
  console.log(totalLen);
  console.log(acc);
}

main();
