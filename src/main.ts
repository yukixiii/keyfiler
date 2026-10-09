import { Plugin, TFolder } from "obsidian";
import { TextCache } from "./grep/cache";
import { FileBrowserModal } from "./pickers/FileBrowser";
import { turnImeOff } from "./ime";
import { FindFilesModal } from "./pickers/FindFiles";
import { GrepModal } from "./pickers/Grep";
import { KeyfilerSettingTab, loadSettings, type KeyfilerSettings } from "./settings";

export default class KeyfilerPlugin extends Plugin {
	settings!: KeyfilerSettings;
	/** File contents for grep, kept between picker sessions. */
	textCache!: TextCache;
	private imeTimer: number | null = null;

	async onload(): Promise<void> {
		this.settings = loadSettings(await this.loadData());
		this.addSettingTab(new KeyfilerSettingTab(this.app, this));
		this.textCache = new TextCache(this.app.vault);
		this.registerEvent(this.app.vault.on("delete", (f) => this.textCache.forget(f.path)));
		this.registerEvent(this.app.vault.on("rename", (_f, oldPath) => this.textCache.forget(oldPath)));
		this.register(() => this.textCache.clear());

		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				if (!file || !this.settings.imeOffOnFileOpen) return;
				// Run after focus has settled in the new view: the IME state belongs to the focused input context.
				if (this.imeTimer !== null) window.clearTimeout(this.imeTimer);
				this.imeTimer = window.setTimeout(() => {
					this.imeTimer = null;
					this.imeOff();
				}, 50);
			}),
		);
		this.register(() => {
			if (this.imeTimer !== null) window.clearTimeout(this.imeTimer);
		});

		this.addCommand({
			id: "find-files",
			name: "Find files",
			callback: () => new FindFilesModal(this).open(),
		});

		this.addCommand({
			id: "grep",
			name: "Grep",
			callback: () => new GrepModal(this).open(),
		});

		this.addCommand({
			id: "grep-selection",
			name: "Grep selected text",
			editorCallback: (editor) => {
				// the selection's first line, or the word under the cursor
				let query = editor.getSelection().split("\n")[0];
				if (!query.trim()) {
					const word = editor.wordAt(editor.getCursor());
					query = word ? editor.getRange(word.from, word.to) : "";
				}
				new GrepModal(this, { query }).open();
			},
		});

		this.addCommand({
			id: "file-browser-current-folder",
			name: "File browser (current folder)",
			callback: () => {
				const active = this.app.workspace.getActiveFile();
				const folder = active?.parent instanceof TFolder ? active.parent : this.app.vault.getRoot();
				new FileBrowserModal(this, { folder, focus: active?.path }).open();
			},
		});

		this.addCommand({
			id: "file-browser-root",
			name: "File browser (vault root)",
			callback: () => new FileBrowserModal(this, { folder: this.app.vault.getRoot() }).open(),
		});
	}

	imeOff(): void {
		turnImeOff(this.settings.imeOffCommand);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
