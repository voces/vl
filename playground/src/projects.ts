// User-project persistence for the playground (save / rename / delete / restore).
//
// The built-in `SAMPLES` (samples.ts) are READ-ONLY seed projects. This module
// adds USER projects in `localStorage` alongside them, plus a "last session"
// record so a reload restores the open project AND its unsaved buffer edits.
//
// It is pure / DOM-free apart from `localStorage` (always present in the page and
// in Deno), so the save/save-as/rename/delete flows and the restore logic are
// unit-checkable from `verify.ts`. `main.ts` owns the Monaco models and chrome;
// it calls these functions and renders their results.
//
// A "project file" mirrors `samples.ts`'s `SampleFile` shape so a built-in can be
// forked into a user project (and a user project loaded) with no conversion.

export type ProjectFile = { name: string; source: string };

/** A persisted user project: a named, ordered list of files. */
export type UserProject = {
  /** Stable id (never reused); names can change and collide, ids cannot. */
  id: string;
  name: string;
  files: ProjectFile[];
  createdAt: number;
  updatedAt: number;
};

/**
 * The "what was open last" record. `files` is the LIVE buffer contents at the
 * time of the last edit — saved or not — so a refresh restores in-progress work.
 * `ref` records what the buffer was based on (a user project or a built-in
 * sample) so the selector can re-highlight it; it is informational only —
 * `files` is the source of truth for what to show.
 */
export type LastSession = {
  ref:
    | { kind: "user"; id: string }
    | { kind: "sample"; index: number }
    | { kind: "scratch" };
  files: ProjectFile[];
};

const PROJECTS_KEY = "vl-projects";
const LAST_KEY = "vl-last-session";

// --- low-level storage (defensive JSON; corrupt/absent data → empty) ---------

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded / storage disabled — persistence is best-effort.
  }
};

// --- project list ------------------------------------------------------------

/** All saved user projects, most-recently-updated first. */
export const listProjects = (): UserProject[] => {
  const all = readJson<UserProject[]>(PROJECTS_KEY, []);
  if (!Array.isArray(all)) return [];
  return all
    .filter((p) => p && typeof p.id === "string" && Array.isArray(p.files))
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

export const getProject = (id: string): UserProject | undefined =>
  listProjects().find((p) => p.id === id);

/** Whether a user project with this (case-sensitive) name already exists. */
export const nameExists = (name: string, exceptId?: string): boolean =>
  listProjects().some((p) => p.name === name && p.id !== exceptId);

const persist = (projects: UserProject[]): void => writeJson(PROJECTS_KEY, projects);

const newId = (): string =>
  `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * Create a NEW user project (a "Save As" / forking a built-in). Returns the
 * created project. Names are not forced unique here — the caller (UI) decides
 * whether to warn on a collision — but each project gets its own stable id.
 */
export const createProject = (name: string, files: ProjectFile[]): UserProject => {
  const now = Date.now();
  const project: UserProject = {
    id: newId(),
    name: name.trim(),
    files: cloneFiles(files),
    createdAt: now,
    updatedAt: now,
  };
  persist([project, ...listProjects()]);
  return project;
};

/**
 * Update an existing user project's FILES in place (the "Save" of an already-
 * named user project). Returns the updated project, or null if the id is gone.
 */
export const updateProject = (
  id: string,
  files: ProjectFile[],
): UserProject | null => {
  const all = listProjects();
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  const updated: UserProject = {
    ...all[idx],
    files: cloneFiles(files),
    updatedAt: Date.now(),
  };
  all[idx] = updated;
  persist(all);
  return updated;
};

/** Rename a user project. Returns the updated project, or null if missing. */
export const renameProject = (id: string, name: string): UserProject | null => {
  const all = listProjects();
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  const updated: UserProject = {
    ...all[idx],
    name: name.trim(),
    updatedAt: Date.now(),
  };
  all[idx] = updated;
  persist(all);
  return updated;
};

/** Delete a user project. Returns true if one was removed. */
export const deleteProject = (id: string): boolean => {
  const all = listProjects();
  const next = all.filter((p) => p.id !== id);
  if (next.length === all.length) return false;
  persist(next);
  return true;
};

const cloneFiles = (files: ProjectFile[]): ProjectFile[] =>
  files.map((f) => ({ name: f.name, source: f.source }));

// --- last-session restore ----------------------------------------------------

/** Record the currently-open project + its live (possibly unsaved) buffers. */
export const saveLastSession = (session: LastSession): void =>
  writeJson(LAST_KEY, {
    ref: session.ref,
    files: cloneFiles(session.files),
  });

/**
 * The last session, or null if none / malformed. A stale `user` ref (the project
 * was deleted) is still returned — `files` holds the buffer contents, so the work
 * is restored even though the selector won't re-highlight a missing project.
 */
export const loadLastSession = (): LastSession | null => {
  const s = readJson<LastSession | null>(LAST_KEY, null);
  if (!s || !s.ref || !Array.isArray(s.files) || s.files.length === 0) return null;
  const k = s.ref.kind;
  if (k !== "user" && k !== "sample" && k !== "scratch") return null;
  return s;
};

export const clearLastSession = (): void => {
  try {
    localStorage.removeItem(LAST_KEY);
  } catch {
    // best-effort
  }
};
