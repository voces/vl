# The owner of an I8 census class, shared by red.sh and class-programs.sh (each splices this file
# into its awk program): the class's line in owners.tsv, else its mechanism family's owner
# (coordinator, 2026-11-26). A class is looked up with any `: detail` dropped. Load the registry
# first with `famLoad(<owners.tsv>)`.
function famLoad(path,   line, f) {
  while ((getline line < path) > 0) {
    if (line ~ /^#/) continue
    split(line, f, "\t")
    if (f[2] != "") famOwn[f[1]] = f[2]
  }
  close(path)
}
function family(k) {
  if (k ~ /^convert /) return "COV-CALL"
  if (k ~ /^local rep /) return "COV-START"
  if (k ~ /^(is|box) /) return "COV-IS"
  if (k ~ /(^|[ -])(coalesce|short-circuit|compare)( |$)/) return "COV-UNION"
  if (k ~ /(^|[ -])(lambda|closure)( |$)/) return "COV-CLOS"
  if (k ~ /^(global|if|assignment|operand) /) return "START-2"
  return "CENSUS"
}
function famOwner(c,   k) {
  k = c; sub(/: .*/, "", k)
  if (k ~ /^claim fell back/) k = "claim fell back"
  return (k in famOwn) ? famOwn[k] : family(k)
}
