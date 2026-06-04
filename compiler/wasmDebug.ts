// Debug helpers for inspecting the codegen pipeline.
export const logSimplified = (obj: unknown): unknown => {
  if (obj == null) return obj;
  if (typeof obj !== "object") return obj;
  if (
    "type" in obj && obj.type === "Object" && "name" in obj &&
    typeof obj.name === "string"
  ) {
    return { type: "Alias", name: obj.name };
  }
  if (Array.isArray(obj)) return obj.map((v) => logSimplified(v));
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, logSimplified(v)]),
  );
};
