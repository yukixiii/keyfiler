import { TAbstractFile, TFile, TFolder } from "obsidian";
import type KeyfilerPlugin from "../main";
import { copyInto, createEntry, notifyError, renameTo, runBatch, trash } from "../fileOps";
import { PASS, PickerModal, renderHighlighted, type ActionOutcome, type PickerOptions, type Result } from "../ui/PickerModal";
import type { ActionId } from "../ui/keymap";
import { joinPath, parentPath, parseNewEntry, parseRename, splitExt } from "../util/path";
import { FindFilesModal } from "./FindFiles";
import { GrepModal } from "./Grep";

export interface FileBrowserOptions extends PickerOptions {
	/** Folder to start in. Defaults to the vault root. */
	folder?: TFolder;
	/** Path of the item to place the cursor on. */
	focus?: string;
}

/** Folder-by-folder browser with file operations. */
export class FileBrowserModal extends PickerModal {
	protected readonly pickerKind = "browser";
	private cwd: TFolder;
	private initialFocus?: string;

	constructor(plugin: KeyfilerPlugin, opts: FileBrowserOptions = {}) {
		super(plugin, opts);
		this.cwd = opts.folder ?? plugin.app.vault.getRoot();
		this.initialFocus = opts.focus;
	}

	onOpen(): void {
		super.onOpen();
		if (this.initialFocus) this.refresh(this.initialFocus);
	}

	protected loadItems(): TAbstractFile[] {
		// the folder may have been deleted (or replaced) in the meantime
		if (this.app.vault.getAbstractFileByPath(this.cwd.path) !== this.cwd) this.cwd = this.app.vault.getRoot();
		return [...this.cwd.children].sort((a, b) => {
			const fa = a instanceof TFolder ? 0 : 1;
			const fb = b instanceof TFolder ? 0 : 1;
			return fa - fb || a.name.localeCompare(b.name, undefined, { numeric: true });
		});
	}

	protected matchText(file: TAbstractFile): string {
		return file.name;
	}

	protected promptLabel(): string {
		return this.cwd.isRoot() ? "/" : `${this.cwd.path}/`;
	}

	protected renderRow(row: HTMLElement, result: Result): void {
		const name = row.createSpan({ cls: "keyfiler-name" });
		renderHighlighted(name, result.text, result.matches);
		if (result.file instanceof TFolder) name.createSpan({ cls: "keyfiler-slash", text: "/" });
	}

	protected openFolder(folder: TFolder): void {
		this.cd(folder);
	}

	private cd(folder: TFolder, focus?: string): void {
		this.cwd = folder;
		this.setQuery("");
		this.cursor = 0;
		this.refresh(focus);
		this.renderPromptLine();
	}

	protected runPickerAction(action: ActionId): Promise<ActionOutcome> | ActionOutcome | false {
		switch (action) {
			case "goParent":
				return this.goParent();
			case "create":
				return this.create();
			case "rename":
				return this.rename();
			case "moveMarked":
				return this.moveMarked();
			case "copyMarked":
				return this.copyMarked();
			case "delete":
				return this.deleteTargets();
			case "goRoot":
				return this.cd(this.app.vault.getRoot());
			case "goCurrent": {
				const active = this.app.workspace.getActiveFile();
				if (active?.parent) this.cd(active.parent, active.path);
				return;
			}
			case "switchToFind":
				this.close();
				new FindFilesModal(this.plugin, { root: this.cwd.path, marked: this.marked }).open();
				return;
			case "grepInFolder":
				this.close();
				new GrepModal(this.plugin, { root: this.cwd.path, marked: this.marked }).open();
				return;
			default:
				return false;
		}
	}

	private goParent(): ActionOutcome {
		// In Insert mode keys like <BS> should keep editing the query while it is not empty.
		if (this.mode === "insert" && this.query !== "") return PASS;
		const parent = this.cwd.parent;
		if (!parent || this.cwd.isRoot()) return;
		this.cd(parent, this.cwd.path);
	}

	private create(): void {
		this.startPrompt("text", `New in ${this.promptLabel()} (end with / for folder):`, "", async (value) => {
			const entry = parseNewEntry(this.cwd.path, value);
			if (!entry) return;
			try {
				const created = await createEntry(this.app, entry);
				if (created instanceof TFile && this.plugin.settings.openAfterCreate) {
					this.close();
					await this.openFile(created, this.plugin.settings.openIn === "tab" ? "tab" : "default");
					return;
				}
				// focus the created item, or the top-level entry that contains it
				const rel = created.path.slice(this.cwd.isRoot() ? 0 : this.cwd.path.length + 1);
				this.refresh(joinPath(this.cwd.path, rel.split("/")[0]));
			} catch (e) {
				notifyError(e);
			}
		});
	}

	private rename(): void {
		const cur = this.current();
		if (!cur) return;
		const name = cur.name;
		const stemLen = cur instanceof TFile ? splitExt(name)[0].length : name.length;
		this.startPrompt(
			"text",
			`Rename ${cur.path}${cur instanceof TFolder ? "/" : ""} to:`,
			name,
			async (value) => {
				const newPath = parseRename(cur.path, value);
				if (!newPath) return;
				try {
					const wasMarked = this.marked.delete(cur.path);
					await renameTo(this.app, cur, newPath);
					if (wasMarked) this.marked.add(cur.path);
					this.refresh(parentPath(cur.path) === this.cwd.path ? cur.path : undefined);
				} catch (e) {
					notifyError(e);
				}
			},
			[0, stemLen],
		);
	}

	private requireMarks(verb: string): TAbstractFile[] | null {
		const files = this.markedFiles();
		if (files.length === 0) {
			notifyError(`Nothing marked. Mark items with Tab, open the destination folder, then ${verb}.`);
			return null;
		}
		return files;
	}

	private async moveMarked(): Promise<void> {
		const files = this.requireMarks("move");
		if (!files) return;
		const dest = this.cwd.path;
		await runBatch(files, "Moved", async (f) => {
			if (f.parent === this.cwd) throw new Error("already in this folder");
			await renameTo(this.app, f, joinPath(dest, f.name));
		});
		this.marked.clear();
		this.refresh(files[0]?.path);
	}

	private async copyMarked(): Promise<void> {
		const files = this.requireMarks("copy");
		if (!files) return;
		let first: string | undefined;
		await runBatch(files, "Copied", async (f) => {
			const p = await copyInto(this.app, f, this.cwd.path);
			first ??= p;
		});
		this.marked.clear();
		this.refresh(first);
	}

	private deleteTargets(): void {
		const files = this.targets();
		if (files.length === 0) return;
		const what = files.length === 1 ? `"${files[0].path}"` : `${files.length} items`;
		this.startPrompt("confirm", `Delete ${what}? (y/N)`, "", async () => {
			await runBatch(files, "Deleted", (f) => trash(this.app, f));
			this.marked.clear();
			this.refresh();
		});
	}
}

/** Open the file browser at `item`'s folder with the cursor on it, carrying `marked` over. */
export function revealInBrowser(plugin: KeyfilerPlugin, item: TAbstractFile | null, marked: Set<string>): void {
	const target = item ? plugin.app.vault.getAbstractFileByPath(parentPath(item.path)) : null;
	const folder = target instanceof TFolder ? target : plugin.app.vault.getRoot();
	new FileBrowserModal(plugin, { folder, focus: item instanceof TFile ? item.path : undefined, marked }).open();
}
