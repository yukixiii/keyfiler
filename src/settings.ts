import { App, PluginSettingTab, Setting, TextComponent } from "obsidian";
import { defaultImeOffCommand } from "./ime";
import type KeyfilerPlugin from "./main";
import {
	ACTIONS,
	ACTION_IDS,
	DEFAULT_KEYMAP,
	eventToString,
	findConflicts,
	mergeKeymap,
	parseSequence,
	splitNotations,
	type ActionId,
	type ActionScope,
	type Keymap,
	type Mode,
} from "./ui/keymap";

export interface KeyfilerSettings {
	startMode: Mode;
	showPreview: boolean;
	maxResults: number;
	openIn: "current" | "tab";
	openAfterCreate: boolean;
	imeOffOnNormal: boolean;
	imeOffOnFileOpen: boolean;
	imeOffCommand: string;
	keymap: Keymap;
}

export const DEFAULT_SETTINGS: KeyfilerSettings = {
	startMode: "insert",
	showPreview: true,
	maxResults: 200,
	openIn: "current",
	openAfterCreate: true,
	imeOffOnNormal: true,
	imeOffOnFileOpen: true,
	imeOffCommand: defaultImeOffCommand(),
	keymap: DEFAULT_KEYMAP,
};

export function loadSettings(data: unknown): KeyfilerSettings {
	const d = (data && typeof data === "object" ? data : {}) as Partial<KeyfilerSettings>;
	return {
		startMode: d.startMode === "normal" ? "normal" : "insert",
		showPreview: typeof d.showPreview === "boolean" ? d.showPreview : DEFAULT_SETTINGS.showPreview,
		maxResults: typeof d.maxResults === "number" && d.maxResults > 0 ? d.maxResults : DEFAULT_SETTINGS.maxResults,
		openIn: d.openIn === "tab" ? "tab" : "current",
		openAfterCreate: typeof d.openAfterCreate === "boolean" ? d.openAfterCreate : DEFAULT_SETTINGS.openAfterCreate,
		imeOffOnNormal: typeof d.imeOffOnNormal === "boolean" ? d.imeOffOnNormal : DEFAULT_SETTINGS.imeOffOnNormal,
		imeOffOnFileOpen: typeof d.imeOffOnFileOpen === "boolean" ? d.imeOffOnFileOpen : DEFAULT_SETTINGS.imeOffOnFileOpen,
		imeOffCommand: typeof d.imeOffCommand === "string" ? d.imeOffCommand : DEFAULT_SETTINGS.imeOffCommand,
		keymap: mergeKeymap(d.keymap),
	};
}

const SCOPE_TITLES: Record<ActionScope, string> = {
	common: "Common",
	find: "Find files only",
	browser: "File browser only",
};

export class KeyfilerSettingTab extends PluginSettingTab {
	private conflictsEl: HTMLElement | null = null;
	private stopRecording: (() => void) | null = null;

	constructor(
		app: App,
		private plugin: KeyfilerPlugin,
	) {
		super(app, plugin);
	}

	hide(): void {
		this.stopRecording?.();
	}

	display(): void {
		const { containerEl } = this;
		const s = this.plugin.settings;
		this.stopRecording?.();
		containerEl.empty();

		new Setting(containerEl)
			.setName("Start mode")
			.setDesc("Mode the picker starts in.")
			.addDropdown((d) =>
				d
					.addOptions({ insert: "Insert", normal: "Normal" })
					.setValue(s.startMode)
					.onChange(async (v) => {
						s.startMode = v as Mode;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Show preview").addToggle((t) =>
			t.setValue(s.showPreview).onChange(async (v) => {
				s.showPreview = v;
				await this.plugin.saveSettings();
			}),
		);

		new Setting(containerEl)
			.setName("Max results")
			.setDesc("Maximum number of items rendered in the list.")
			.addText((t) =>
				t.setValue(String(s.maxResults)).onChange(async (v) => {
					const n = Number.parseInt(v, 10);
					if (Number.isFinite(n) && n > 0) {
						s.maxResults = n;
						await this.plugin.saveSettings();
					}
				}),
			);

		new Setting(containerEl)
			.setName("Open with Enter in")
			.setDesc("Where the 'Open' action opens files.")
			.addDropdown((d) =>
				d
					.addOptions({ current: "Current tab", tab: "New tab" })
					.setValue(s.openIn)
					.onChange(async (v) => {
						s.openIn = v as "current" | "tab";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Open file after creating")
			.setDesc("Open a newly created file and close the browser. When off, the browser stays open with the new item selected.")
			.addToggle((t) =>
				t.setValue(s.openAfterCreate).onChange(async (v) => {
					s.openAfterCreate = v;
					await this.plugin.saveSettings();
				}),
			);

		this.displayIme(containerEl);
		this.displayKeymap(containerEl);
	}

	private displayIme(containerEl: HTMLElement): void {
		const s = this.plugin.settings;
		new Setting(containerEl).setName("IME").setHeading();

		new Setting(containerEl)
			.setName("Turn IME off in Normal mode")
			.setDesc("Switch the IME off when the picker enters Normal mode (e.g. Esc after typing Japanese), like vim's im-select.")
			.addToggle((t) =>
				t.setValue(s.imeOffOnNormal).onChange(async (v) => {
					s.imeOffOnNormal = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Turn IME off when a file is opened")
			.setDesc("Switch the IME off whenever a file is opened in Obsidian, by any means.")
			.addToggle((t) =>
				t.setValue(s.imeOffOnFileOpen).onChange(async (v) => {
					s.imeOffOnFileOpen = v;
					await this.plugin.saveSettings();
				}),
			);

		const desc = createFragment((f) => {
			f.appendText("Shell command that switches the IME off. Examples: ");
			f.createEl("code", { text: "fcitx5-remote -c" });
			f.appendText(" (fcitx5), ");
			f.createEl("code", { text: "ibus engine xkb:us::eng" });
			f.appendText(" (IBus), ");
			f.createEl("code", { text: "im-select com.apple.keylayout.ABC" });
			f.appendText(" (macOS). Leave empty to disable. Desktop only.");
		});
		new Setting(containerEl)
			.setName("IME off command")
			.setDesc(desc)
			.addText((t) =>
				t
					.setPlaceholder("fcitx5-remote -c")
					.setValue(s.imeOffCommand)
					.onChange(async (v) => {
						s.imeOffCommand = v.trim();
						await this.plugin.saveSettings();
					}),
			);
	}

	private displayKeymap(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Keymap").setHeading();

		const help = containerEl.createDiv({ cls: "setting-item-description keyfiler-keymap-help" });
		help.appendText("Vim-style notation, comma separated: ");
		help.createEl("code", { text: "j" });
		help.appendText(", ");
		help.createEl("code", { text: "gg" });
		help.appendText(", ");
		help.createEl("code", { text: "<C-n>" });
		help.appendText(" (Ctrl), ");
		help.createEl("code", { text: "<A-c>" });
		help.appendText(" (Alt), ");
		help.createEl("code", { text: "<S-Tab>" });
		help.appendText(" (Shift), ");
		help.createEl("code", { text: "<D-k>" });
		help.appendText(" (Cmd). Special keys: ");
		help.createEl("code", { text: "<CR> <Esc> <Tab> <Space> <BS> <Del> <Up> <Down> <Left> <Right> <Home> <End> <PageUp> <PageDown> <lt> <comma>" });
		help.appendText(". The keyboard button next to a field records a single key press. Changes apply the next time the picker is opened.");

		new Setting(containerEl).setName("Reset all key bindings").addButton((b) =>
			b
				.setButtonText("Reset all")
				.setWarning()
				.onClick(async () => {
					this.plugin.settings.keymap = mergeKeymap(undefined);
					await this.plugin.saveSettings();
					this.display();
				}),
		);

		this.conflictsEl = containerEl.createDiv({ cls: "keyfiler-conflicts" });
		this.renderConflicts();

		for (const scope of ["common", "find", "browser"] as ActionScope[]) {
			new Setting(containerEl).setName(SCOPE_TITLES[scope]).setHeading();
			const header = containerEl.createDiv({ cls: "keyfiler-keymap-header" });
			header.createSpan({ text: "Action" });
			header.createSpan({ text: "Insert mode" });
			header.createSpan({ text: "Normal mode" });
			for (const id of ACTION_IDS.filter((a) => ACTIONS[a].scope === scope)) {
				this.renderActionRow(containerEl, id);
			}
		}
	}

	private renderActionRow(containerEl: HTMLElement, id: ActionId): void {
		const setting = new Setting(containerEl).setName(ACTIONS[id].desc).setClass("keyfiler-keymap-row");
		const fields: Partial<Record<Mode, TextComponent>> = {};
		for (const mode of ["insert", "normal"] as Mode[]) {
			setting.addText((t) => {
				fields[mode] = t;
				t.setPlaceholder("(none)")
					.setValue(this.plugin.settings.keymap[id][mode].join(", "))
					.onChange(async (v) => {
						await this.updateBinding(id, mode, t, v);
					});
				t.inputEl.addClass("keyfiler-keymap-input");
				t.inputEl.dataset.mode = mode;
			});
			setting.addExtraButton((b) =>
				b
					.setIcon("keyboard")
					.setTooltip(`Record a key for ${mode} mode`)
					.onClick(() => {
						const field = fields[mode];
						if (field) this.record(b.extraSettingsEl, id, mode, field);
					}),
			);
		}
		setting.addExtraButton((b) =>
			b
				.setIcon("rotate-ccw")
				.setTooltip("Reset to default")
				.onClick(async () => {
					const def = DEFAULT_KEYMAP[id];
					this.plugin.settings.keymap[id] = { insert: [...def.insert], normal: [...def.normal] };
					fields.insert?.setValue(def.insert.join(", "));
					fields.normal?.setValue(def.normal.join(", "));
					fields.insert?.inputEl.removeClass("keyfiler-invalid");
					fields.normal?.inputEl.removeClass("keyfiler-invalid");
					await this.plugin.saveSettings();
					this.renderConflicts();
				}),
		);
	}

	private async updateBinding(id: ActionId, mode: Mode, field: TextComponent, value: string): Promise<void> {
		const notations = splitNotations(value);
		const invalid = notations.filter((n) => parseSequence(n) === null);
		field.inputEl.toggleClass("keyfiler-invalid", invalid.length > 0);
		field.inputEl.title = invalid.length > 0 ? `Invalid: ${invalid.join(", ")}` : "";
		if (invalid.length > 0) return;
		this.plugin.settings.keymap[id][mode] = notations;
		await this.plugin.saveSettings();
		this.renderConflicts();
	}

	/** Capture the next key press (bypassing Obsidian hotkeys) and append it to the field. */
	private record(buttonEl: HTMLElement, id: ActionId, mode: Mode, field: TextComponent): void {
		const sameButton = buttonEl.hasClass("keyfiler-recording");
		this.stopRecording?.();
		if (sameButton) return; // second click on the same button cancels

		buttonEl.addClass("keyfiler-recording");
		field.inputEl.addClass("keyfiler-recording");
		const onKey = (e: KeyboardEvent) => {
			if (e.isComposing) return;
			const stroke = eventToString(e);
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
			if (!stroke) return; // modifier only: keep waiting
			stop();
			const current = splitNotations(field.getValue());
			if (!current.includes(stroke)) current.push(stroke);
			const value = current.join(", ");
			field.setValue(value);
			void this.updateBinding(id, mode, field, value);
		};
		const stop = () => {
			window.removeEventListener("keydown", onKey, true);
			buttonEl.removeClass("keyfiler-recording");
			field.inputEl.removeClass("keyfiler-recording");
			this.stopRecording = null;
		};
		window.addEventListener("keydown", onKey, true);
		this.stopRecording = stop;
	}

	private renderConflicts(): void {
		const el = this.conflictsEl;
		if (!el) return;
		el.empty();
		const conflicts = findConflicts(this.plugin.settings.keymap);
		if (conflicts.length === 0) return;
		el.createDiv({ cls: "keyfiler-conflicts-title", text: "⚠ Key binding conflicts" });
		const list = el.createEl("ul");
		for (const c of conflicts) {
			const names = c.actions.map((a) => `"${ACTIONS[a].desc}"`).join(" and ");
			const what =
				c.kind === "duplicate"
					? `${c.keys} is bound to both ${names}`
					: `${c.keys}: the shorter key shadows the longer sequence (${names})`;
			list.createEl("li", { text: `[${c.mode}] ${what}` });
		}
	}
}
