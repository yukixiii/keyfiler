import { TAbstractFile, TFolder } from "obsidian";
import type KeyfilerPlugin from "../main";
import { PickerModal, renderHighlighted, type ActionOutcome, type PickerOptions, type Result } from "../ui/PickerModal";
import type { ActionId } from "../ui/keymap";
import { isRoot } from "../util/path";
import { listFiles } from "../util/vaultFiles";
import { revealInBrowser } from "./FileBrowser";
import { GrepModal } from "./Grep";

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
		return listFiles(this.app, this.root);
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
		switch (action) {
			case "revealInBrowser":
				this.close();
				return revealInBrowser(this.plugin, this.current(), this.marked);
			case "switchToGrep":
				this.close();
				new GrepModal(this.plugin, { root: this.root, query: this.query, marked: this.marked }).open();
				return;
			default:
				return false;
		}
	}
}
