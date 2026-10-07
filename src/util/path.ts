// Pure vault-path helpers. Must not import from "obsidian" so it can be unit-tested.
// Vault paths are "/"-separated, relative, with "/" denoting the root folder.

export function isRoot(path: string): boolean {
	return path === "" || path === "/";
}

export function joinPath(dir: string, name: string): string {
	const n = name.replace(/^\/+/, "");
	return isRoot(dir) ? n : `${dir.replace(/\/+$/, "")}/${n}`;
}

export function parentPath(path: string): string {
	const i = path.lastIndexOf("/");
	return i <= 0 ? "/" : path.slice(0, i);
}

export function baseName(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

/** Split "a/b/note.md" into ["a/b/note", ".md"]. Dotfiles like ".hidden" have no extension. */
export function splitExt(path: string): [string, string] {
	const base = baseName(path);
	const i = base.lastIndexOf(".");
	if (i <= 0) return [path, ""];
	const cut = path.length - (base.length - i);
	return [path.slice(0, cut), path.slice(cut)];
}

/** Return `path` if free, otherwise "name 1.ext", "name 2.ext", ... */
export function uniquePath(path: string, exists: (p: string) => boolean): string {
	if (!exists(path)) return path;
	const [stem, ext] = splitExt(path);
	for (let n = 1; ; n++) {
		const candidate = `${stem} ${n}${ext}`;
		if (!exists(candidate)) return candidate;
	}
}

export interface NewEntry {
	path: string;
	isFolder: boolean;
}

/**
 * Interpret user input for "create" relative to `dir`.
 * Trailing "/" creates a folder; a name without extension gets ".md".
 * Returns null for empty / invalid input.
 */
export function parseNewEntry(dir: string, input: string): NewEntry | null {
	const text = input.trim();
	if (!text) return null;
	const isFolder = text.endsWith("/");
	const rel = text.replace(/\/+$/, "").replace(/^\/+/, "");
	if (!rel || rel.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return null;
	let path = joinPath(dir, rel);
	if (!isFolder && splitExt(path)[1] === "") path += ".md";
	return { path, isFolder };
}

/**
 * Interpret user input for "rename" of the item at `oldPath`.
 * A plain name stays in the same folder; a name containing "/" is relative to that folder.
 * Returns null for empty / invalid input.
 */
export function parseRename(oldPath: string, input: string): string | null {
	const text = input.trim().replace(/\/+$/, "");
	if (!text) return null;
	const rel = text.replace(/^\/+/, "");
	if (rel.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return null;
	return text.startsWith("/") ? rel : joinPath(parentPath(oldPath), rel);
}

/** True if `path` equals `ancestor` or lies inside it. */
export function isWithin(path: string, ancestor: string): boolean {
	if (isRoot(ancestor)) return true;
	return path === ancestor || path.startsWith(`${ancestor}/`);
}
