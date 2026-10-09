import type { TFile, Vault } from "obsidian";

/** File contents cached across picker sessions, revalidated by mtime and size. */
export class TextCache {
	private entries = new Map<string, { mtime: number; size: number; text: string }>();

	constructor(private vault: Vault) {}

	async read(file: TFile): Promise<string> {
		const hit = this.entries.get(file.path);
		if (hit && hit.mtime === file.stat.mtime && hit.size === file.stat.size) return hit.text;
		const text = await this.vault.cachedRead(file);
		this.entries.set(file.path, { mtime: file.stat.mtime, size: file.stat.size, text });
		return text;
	}

	forget(path: string): void {
		this.entries.delete(path);
	}

	clear(): void {
		this.entries.clear();
	}
}
