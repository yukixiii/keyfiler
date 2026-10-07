import { TAbstractFile, TFile, TFolder } from "obsidian";
import type KeyfilerPlugin from "../main";
import { PickerModal, renderHighlighted, type ActionOutcome, type PickerOptions, type Result } from "../ui/PickerModal";
import type { ActionId } from "../ui/keymap";
import { isRoot, isWithin, parentPath } from "../util/path";
import { FileBrowserModal } from "./FileBrowser";

export interface FindFilesOptions extends PickerOptions {
	/** Restrict results to this folder (vault path). Defaults to the whole vault. */
	root?: string;
}

/** Fuzzy finder over every file in the vault (or under a folder). */
export class FindFilesModal extends PickerModal {
	protected readonly pickerKind = "find";
	private root: string;

	constructor(plugin: KeyfilerPlugin, opts: FindFilesOptions = {}) {
		super(plugin, opts);
		this.root = opts.root && !isRoot(opts.root) ? opts.root : "/";
	}

	protected loadItems(): TAbstractFile[] {
		const { vault, metadataCache, workspace } = this.app;
		// isUserIgnored is not part of the public API; it reflects "Excluded files" in settings.
		const ignored = (metadataCache as unknown as { isUserIgnored?: (p: string) => boolean }).isUserIgnored;
		const files = vault
			.getFiles()
			.filter((f) => isWithin(f.path, this.root) && !ignored?.call(metadataCache, f.path));

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

	protected matchText(file: TAbstractFile): string {
		return file.path;
	}

	protected promptLabel(): string {
		return isRoot(this.root) ? "Find" : `Find in ${this.root}/`;
	}

	protected renderRow(row: HTMLElement, result: Result): void {
		const { file, text, matches } = result;
		const dirLen = text.length - file.name.length;
		renderHighlighted(row.createSpan({ cls: "keyfiler-name" }), file.name, matches, dirLen);
		if (dirLen > 0) {
			renderHighlighted(row.createSpan({ cls: "keyfiler-dir" }), text.slice(0, dirLen - 1), matches, 0);
		}
	}

	protected openFolder(_folder: TFolder): void {
		// find results only contain files
	}

	protected runPickerAction(action: ActionId): ActionOutcome | false {
		if (action !== "revealInBrowser") return false;
		const cur = this.current();
		const target = cur ? this.app.vault.getAbstractFileByPath(parentPath(cur.path)) : null;
		const folder = target instanceof TFolder ? target : this.app.vault.getRoot();
		this.close();
		new FileBrowserModal(this.plugin, { folder, focus: cur instanceof TFile ? cur.path : undefined, marked: this.marked }).open();
	}
}
