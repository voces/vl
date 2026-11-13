## Infrastructure (Track F)

- **Step 7: the render-parse census counts the canon member walk once, and its callers only
  where they read the names.** `canonUnionMembersWalk`'s dedupe by rendered name is one
  `ty-string-parse` site in check_program, while the walk calls `canonEmitNameAt`. A caller of
  `canonUnionMembersInto`/`canonUnionMembersLitsInto` is a site only when it reads the returned
  atoms again; `riuMemberTys`, which reads only the member types, is not. A site a type render
  feeds by construction (`unionHasBoolLeafArm`) is graded render over the corpus probe.
