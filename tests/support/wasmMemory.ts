// Reading a module's linear-memory declaration from its bytes: the section walk and the limits
// (flag, min, max) of the one memory, defined or imported. Shared by the memory-flag suites.

/** A walk over the module's sections: each id with its payload's [start, end). */
export const sections = (bytes: Uint8Array) => {
  const out: { id: number; start: number; end: number }[] = [];
  let at = 8;
  const uleb = () => {
    let v = 0, shift = 0, b = 0;
    do {
      b = bytes[at++];
      v |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80);
    return v;
  };
  while (at < bytes.length) {
    const id = bytes[at++];
    const len = uleb();
    out.push({ id, start: at, end: at + len });
    at += len;
  }
  return out;
};

/** The memory's limits as the module declares them — defined (section 5) or imported (section 2,
 * found as the tail of an import entry of kind 2). `null` when the module has no memory. */
export const memoryLimits = (bytes: Uint8Array) => {
  let at = 0;
  const uleb = () => {
    let v = 0, shift = 0, b = 0;
    do {
      b = bytes[at++];
      v += (b & 0x7f) * 2 ** shift;
      shift += 7;
    } while (b & 0x80);
    return v;
  };
  const limits = () => {
    const flag = bytes[at++];
    const min = uleb();
    const max = flag & 1 ? uleb() : null;
    return { flag, min, max };
  };
  for (const s of sections(bytes)) {
    at = s.start;
    if (s.id === 5) {
      uleb(); // count
      return { where: "defined", ...limits() };
    }
    if (s.id === 2) {
      const n = uleb();
      for (let i = 0; i < n; i++) {
        for (let name = 0; name < 2; name++) { // module name, field name
          const len = uleb(); // read BEFORE adding: `at += uleb()` reads `at` first
          at += len;
        }
        const kind = bytes[at++];
        if (kind === 2) return { where: "imported", ...limits() };
        if (kind === 0) uleb();
        else if (kind === 1) { at++; limits(); } // table: reftype + limits
        else if (kind === 3) { at++; at++; } // global: valtype + mut (i32/f64 only here)
        else throw new Error(`unexpected import kind ${kind}`);
      }
    }
  }
  return null;
};
