import { App, Notice, TAbstractFile, TFile, TFolder, normalizePath } from "obsidian";
import { baseName, isRoot, isWithin, joinPath, parentPath, uniquePath, type NewEntry } from "./util/path";

function exists(app: App, path: string): boolean {
	return app.vault.getAbstractFileByPath(normalizePath(path)) !== null;
}

/** Create `path` and any missing ancestors. */
export async function ensureFolder(app: App, path: string): Promise<void> {
	if (isRoot(path)) return;
	const existing = app.vault.getAbstractFileByPath(normalizePath(path));
	if (existing instanceof TFolder) return;
	if (existing) throw new Error(`"${path}" exists and is not a folder`);
	await ensureFolder(app, parentPath(path));
	await app.vault.createFolder(normalizePath(path));
}

export async function createEntry(app: App, entry: NewEntry): Promise<TAbstractFile> {
	const path = normalizePath(entry.path);
	if (exists(app, path)) throw new Error(`"${path}" already exists`);
	await ensureFolder(app, entry.isFolder ? path : parentPath(path));
	if (entry.isFolder) return app.vault.getAbstractFileByPath(path) as TFolder;
	return app.vault.create(path, "");
}

/** Rename / move with link updates. Creates the destination folder when needed. */
export async function renameTo(app: App, file: TAbstractFile, newPath: string): Promise<void> {
	const path = normalizePath(newPath);
	if (path === file.path) return;
	if (exists(app, path)) throw new Error(`"${path}" already exists`);
	if (file instanceof TFolder && isWithin(path, file.path)) throw new Error(`Cannot move "${file.path}" into itself`);
	await ensureFolder(app, parentPath(path));
	await app.fileManager.renameFile(file, path);
}

async function copyRecursive(app: App, src: TAbstractFile, dest: string): Promise<void> {
	if (src instanceof TFile) {
		await app.vault.copy(src, dest);
		return;
	}
	if (src instanceof TFolder) {
		await app.vault.createFolder(dest);
		// snapshot children: copying into a sibling must not alter iteration
		for (const child of [...src.children]) {
			await copyRecursive(app, child, joinPath(dest, child.name));
		}
	}
}

/** Copy into `dir`, picking a free name ("name 1.md") when taken. Returns the new path. */
export async function copyInto(app: App, file: TAbstractFile, dir: string): Promise<string> {
	if (file instanceof TFolder && isWithin(dir, file.path)) throw new Error(`Cannot copy "${file.path}" into itself`);
	const dest = uniquePath(normalizePath(joinPath(dir, file.name)), (p) => exists(app, p));
	await copyRecursive(app, file, dest);
	return dest;
}

export async function trash(app: App, file: TAbstractFile): Promise<void> {
	await app.fileManager.trashFile(file);
}

/**
 * Run `op` for each file, reporting a summary notice. Errors are collected, not thrown.
 * Returns the number of successful operations.
 */
export async function runBatch(
	files: TAbstractFile[],
	verb: string,
	op: (f: TAbstractFile) => Promise<unknown>,
): Promise<number> {
	let ok = 0;
	const errors: string[] = [];
	for (const f of files) {
		try {
			await op(f);
			ok++;
		} catch (e) {
			errors.push(`${baseName(f.path)}: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
	if (ok > 0) new Notice(`${verb} ${ok} item${ok === 1 ? "" : "s"}`);
	if (errors.length > 0) new Notice(`Keyfiler: ${errors.length} failed\n${errors.join("\n")}`, 8000);
	return ok;
}

export function notifyError(e: unknown): void {
	new Notice(`Keyfiler: ${e instanceof Error ? e.message : String(e)}`, 6000);
}
