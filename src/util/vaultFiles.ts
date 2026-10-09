import type { App, TFile } from "obsidian";
import { isWithin } from "./path";

/**
 * Files under `root` (excluding "Excluded files" from settings), most recently opened first,
 * then by modification time. The active file goes after the other recent files.
 */
export function listFiles(app: App, root: string, filter?: (file: TFile) => boolean): TFile[] {
	const { vault, metadataCache, workspace } = app;
	// isUserIgnored is not part of the public API; it reflects "Excluded files" in settings.
	const ignored = (metadataCache as unknown as { isUserIgnored?: (p: string) => boolean }).isUserIgnored;
	const files = vault
		.getFiles()
		.filter((f) => isWithin(f.path, root) && !ignored?.call(metadataCache, f.path) && (!filter || filter(f)));

	const recent = new Map<string, number>();
	workspace.getLastOpenFiles().forEach((p, i) => recent.set(p, i));
	const active = workspace.getActiveFile()?.path;
	return files.sort((a, b) => {
		// the active file is least likely to be the target: put it after other recent files
		const ra = a.path === active ? recent.size : (recent.get(a.path) ?? Infinity);
		const rb = b.path === active ? recent.size : (recent.get(b.path) ?? Infinity);
		return ra - rb || b.stat.mtime - a.stat.mtime;
	});
}
