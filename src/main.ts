import { Plugin, TFolder } from "obsidian";
import { FileBrowserModal } from "./pickers/FileBrowser";
import { FindFilesModal } from "./pickers/FindFiles";
import { KeyfilerSettingTab, loadSettings, type KeyfilerSettings } from "./settings";

export default class KeyfilerPlugin extends Plugin {
	settings!: KeyfilerSettings;

	async onload(): Promise<void> {
		this.settings = loadSettings(await this.loadData());
		this.addSettingTab(new KeyfilerSettingTab(this.app, this));

		this.addCommand({
			id: "find-files",
			name: "Find files",
			callback: () => new FindFilesModal(this).open(),
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

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
