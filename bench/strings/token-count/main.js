// token-count — see main.vl
const ALPHA = "abcdefghijklmnopqrstuvwxyz";

const LEN = 1000000;
const PASSES = 1000;

function buildInput(n) {
  let chunk = "";
  for (let i = 0; i < 1024; i++) {
    if ((i * 7 + Math.trunc(i / 5)) % 11 === 0) {
      chunk = chunk + " ";
    } else {
      const k = (i * 31 + Math.trunc(i / 7) * 17) % 26;
      chunk = chunk + ALPHA.slice(k, k + 1);
    }
  }
  let s = chunk;
  while (s.length < n) s = s + s;
  return s.slice(0, n);
}

function main() {
  const s = buildInput(LEN);
  let tokens = 0;
  let totalLen = 0;
  let maxLen = 0;
  for (let r = 0; r < PASSES; r++) {
    let inTok = false;
    let curLen = 0;
    const n = s.length;
    for (let i = 0; i < n; i++) {
      const c = s.charCodeAt(i);
      if (c === 32) {
        if (inTok) {
          tokens = tokens + 1;
          totalLen = totalLen + curLen;
          if (curLen > maxLen) maxLen = curLen;
          inTok = false;
          curLen = 0;
        }
      } else {
        inTok = true;
        curLen = curLen + 1;
      }
    }
    if (inTok) {
      tokens = tokens + 1;
      totalLen = totalLen + curLen;
      if (curLen > maxLen) maxLen = curLen;
    }
  }
  console.log(tokens);
  console.log(totalLen);
  console.log(maxLen);
}

main();
