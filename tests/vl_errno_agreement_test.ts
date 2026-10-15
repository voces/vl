// THE ERRNO AGREEMENT. A failed host import answers a WASI preview1 errno, and `std:fs`
// names the ones a caller branches on (`e.code == ENOENT`). The two sides state the
// numbers separately — `mod wasi` in scripts/vl-host/src/main.rs and the `E*` consts in
// std/fs.vl — and nothing else compares them, so a wrong number on either side makes a
// branch silently false. This file is that comparison; it reads source text and runs
// nothing.
//
// What it holds:
//   1. every number on either side is WASI preview1's for that name (`WASI` below);
//   2. a name on both sides has one number;
//   3. a name on ONE side only is listed in `HOST_ONLY` / `STD_ONLY` with its reason,
//      and those lists hold nothing stale;
//   4. main.rs states no errno as a literal: no `<number> // E<NAME>` and no
//      `Err(<number>)` outside `mod wasi`;
//   5. std/fs.vl is std's only source of errno numbers, and `errnoName` names each one.

import { ROOT } from "./support/tree.ts";

const HOST = `${ROOT}/scripts/vl-host/src/main.rs`;
const STD_FS = `${ROOT}/std/fs.vl`;
const STD_DIR = `${ROOT}/std`;

// WASI preview1's `errno` enum, in declaration order (its value is its position).
const WASI_ORDER = `
  SUCCESS 2BIG ACCES ADDRINUSE ADDRNOTAVAIL AFNOSUPPORT AGAIN ALREADY BADF BADMSG BUSY
  CANCELED CHILD CONNABORTED CONNREFUSED CONNRESET DEADLK DESTADDRREQ DOM DQUOT EXIST FAULT
  FBIG HOSTUNREACH IDRM ILSEQ INPROGRESS INTR INVAL IO ISCONN ISDIR LOOP MFILE MLINK MSGSIZE
  MULTIHOP NAMETOOLONG NETDOWN NETRESET NETUNREACH NFILE NOBUFS NODEV NOENT NOEXEC NOLCK
  NOLINK NOMEM NOMSG NOPROTOOPT NOSPC NOSYS NOTCONN NOTDIR NOTEMPTY NOTRECOVERABLE NOTSOCK
  NOTSUP NOTTY NXIO OVERFLOW OWNERDEAD PERM PIPE PROTO PROTONOSUPPORT PROTOTYPE RANGE ROFS
  SPIPE SRCH STALE TIMEDOUT TXTBSY XDEV NOTCAPABLE`.trim().split(/\s+/);
const WASI = new Map(WASI_ORDER.map((n, i) => [`E${n}`, i]));

// Codes the host answers that std reports by number ("errno N"), as its header says.
const HOST_ONLY = new Set(
  `EAGAIN EBADF EBUSY EDQUOT EEXIST EFBIG EINTR ELOOP EMFILE EMLINK ENAMETOOLONG ENFILE
  ENOMEM ENOSYS ENOTEMPTY ENOTSUP EROFS ESPIPE EXDEV`.split(/\s+/),
);

// Codes std names that the native host never answers, each with why that is allowed.
// None today: every exported code is one the host can answer.
const STD_ONLY = new Map<string, string>([]);

function hostTable(
  src: string,
): { table: Map<string, number>; body: [number, number] } {
  const open = src.indexOf("\nmod wasi {\n");
  if (open < 0) throw new Error("main.rs: want a `mod wasi {` block, got none");
  const close = src.indexOf("\n}\n", open);
  const block = src.slice(open, close);
  const table = new Map<string, number>();
  for (const line of block.split("\n").slice(2)) {
    if (line.trim() === "") continue;
    const m = /^\s*pub const (E[A-Z0-9]+): i32 = (\d+);$/.exec(line);
    if (!m) {
      throw new Error(
        `main.rs mod wasi: want \`pub const E…: i32 = N;\`, got ${
          JSON.stringify(line)
        }`,
      );
    }
    if (table.has(m[1])) {
      throw new Error(`main.rs mod wasi: ${m[1]} declared twice`);
    }
    table.set(m[1], Number(m[2]));
  }
  return { table, body: [open, close] };
}

function stdTable(src: string): Map<string, number> {
  const table = new Map<string, number>();
  for (
    const m of src.matchAll(
      /^(?:export )?const (E[A-Z0-9]+)(?:\s*:\s*i32)?\s*=\s*(\d+)\s*$/gm,
    )
  ) {
    if (table.has(m[1])) throw new Error(`std/fs.vl: ${m[1]} declared twice`);
    table.set(m[1], Number(m[2]));
  }
  return table;
}

function checkWasi(side: string, table: Map<string, number>): string[] {
  const bad: string[] = [];
  for (const [name, n] of table) {
    const want = WASI.get(name);
    if (want === undefined) {
      bad.push(`${side}: ${name} is not a WASI preview1 errno`);
    } else if (want !== n) {
      bad.push(`${side}: ${name} want ${want} (WASI preview1), got ${n}`);
    }
  }
  return bad;
}

Deno.test("errno: host and std agree with each other and with WASI preview1", () => {
  const host = hostTable(Deno.readTextFileSync(HOST)).table;
  const std = stdTable(Deno.readTextFileSync(STD_FS));
  if (host.size < 10 || std.size < 5) {
    throw new Error(
      `parsed too little: want >=10 host and >=5 std codes, got ${host.size} and ${std.size}`,
    );
  }
  const bad = [...checkWasi("main.rs", host), ...checkWasi("std/fs.vl", std)];
  for (const [name, n] of std) {
    const h = host.get(name);
    if (h !== undefined && h !== n) {
      bad.push(`${name}: main.rs says ${h}, std/fs.vl says ${n}`);
    }
  }
  const hostOnly = [...host.keys()].filter((n) => !std.has(n)).sort();
  const stdOnly = [...std.keys()].filter((n) => !host.has(n)).sort();
  const wantHostOnly = [...HOST_ONLY].sort();
  const wantStdOnly = [...STD_ONLY.keys()].sort();
  if (hostOnly.join() !== wantHostOnly.join()) {
    bad.push(
      `named only in main.rs: want [${wantHostOnly}] (HOST_ONLY), got [${hostOnly}]`,
    );
  }
  if (stdOnly.join() !== wantStdOnly.join()) {
    bad.push(
      `named only in std/fs.vl: want [${wantStdOnly}] (STD_ONLY), got [${stdOnly}]`,
    );
  }
  if (bad.length) throw new Error(`errno disagreement:\n  ${bad.join("\n  ")}`);
});

Deno.test("errno: main.rs states no errno as a literal outside `mod wasi`", () => {
  const src = Deno.readTextFileSync(HOST);
  const [open, close] = hostTable(src).body;
  const bad: string[] = [];
  let at = 0;
  src.split("\n").forEach((line, i) => {
    const inside = at > open && at < close;
    at += line.length + 1;
    if (inside) return;
    if (
      /\b\d+\)?\s*[,;]?\s*\/\/\s*E[A-Z]{3,}\b/.test(line) ||
      /\bErr\(\d+\)/.test(line)
    ) {
      bad.push(`main.rs:${i + 1}: ${line.trim()}`);
    }
  });
  if (bad.length) {
    throw new Error(
      `want every errno spelled \`wasi::E…\`, got ${bad.length} literal(s):\n  ${
        bad.join("\n  ")
      }`,
    );
  }
});

Deno.test("errno: std/fs.vl is std's only errno source, and errnoName names every code", async () => {
  const fs = Deno.readTextFileSync(STD_FS);
  const std = stdTable(fs);
  const unnamed = [...std.keys()].filter((n) =>
    !new RegExp(`if code == ${n} \\{`).test(fs)
  );
  if (unnamed.length) {
    throw new Error(
      `errnoName: want a branch for every code, got none for [${unnamed}]`,
    );
  }
  const elsewhere: string[] = [];
  for await (const e of Deno.readDir(STD_DIR)) {
    if (!e.isFile || !e.name.endsWith(".vl") || e.name === "fs.vl") continue;
    const src = Deno.readTextFileSync(`${STD_DIR}/${e.name}`);
    for (
      const m of src.matchAll(
        /^(?:export )?const (E[A-Z0-9]+)(?:\s*:\s*i32)?\s*=\s*\d+\s*$/gm,
      )
    ) {
      if (WASI.has(m[1])) elsewhere.push(`std/${e.name}: ${m[1]}`);
    }
  }
  if (elsewhere.length) {
    throw new Error(
      `want errno numbers only in std/fs.vl, got:\n  ${elsewhere.join("\n  ")}`,
    );
  }
});
