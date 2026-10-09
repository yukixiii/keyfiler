import { MarkdownView, Modal, Notice, Scope, TAbstractFile, TFile, TFolder, WorkspaceLeaf, prepareFuzzySearch, setIcon } from "obsidian";
import type KeyfilerPlugin from "../main";
import { renderHighlighted } from "./highlight";
import { Preview } from "./preview";
import {
	ACTIONS,
	compileKeymap,
	eventToString,
	resolve,
	scopesFor,
	type ActionId,
	type CompiledKeymap,
	type Mode,
	type PickerKind,
} from "./keymap";

export interface Result {
	file: TAbstractFile;
	/** Text the query was matched against, and matched [start, end) ranges within it. */
	text: string;
	matches: [number, number][];
	/** 0-based line in the file the result points at (grep hits). */
	line?: number;
}

/** Where to put the cursor after opening a file: `line`, columns [from, to). */
export interface JumpTarget {
	line: number;
	from: number;
	to: number;
}

export { renderHighlighted };

/** Returned by an action to let the key fall through to the input's default behavior. */
export const PASS = Symbol("pass");
export type ActionOutcome = void | typeof PASS;

type OpenHow = "default" | "tab" | "vsplit" | "hsplit";

interface PromptState {
	kind: "text" | "confirm";
	label: string;
	savedQuery: string;
	onSubmit: (value: string) => void | Promise<void>;
}

export interface PickerOptions {
	/** Marks carried over from another picker. */
	marked?: Set<string>;
	/** Initial query. */
	query?: string;
}

/**
 * Base class for keyboard-driven pickers: prompt line, result list, preview and status line,
 * with vim-like Insert/Normal modes and a user-configurable keymap.
 */
export abstract class PickerModal extends Modal {
	protected mode: Mode;
	protected items: TAbstractFile[] = [];
	protected results: Result[] = [];
	protected cursor = 0;
	protected marked: Set<string>;
	protected prompt: PromptState | null = null;

	protected inputEl!: HTMLInputElement;
	protected labelEl!: HTMLElement;
	protected modeEl!: HTMLElement;
	protected listEl!: HTMLElement;
	protected previewEl!: HTMLElement;
	protected statusEl!: HTMLElement;
	protected preview: Preview | null = null;

	private compiled: CompiledKeymap;
	private pending: string[] = [];
	private initialQuery: string;

	protected abstract readonly pickerKind: PickerKind;

	constructor(
		protected plugin: KeyfilerPlugin,
		opts: PickerOptions = {},
	) {
		super(plugin.app);
		this.mode = plugin.settings.startMode;
		this.marked = new Set(opts.marked ?? []);
		this.initialQuery = opts.query ?? "";
		this.compiled = { insert: [], normal: [] };
		// Replace the default scope (whose Escape closes the modal) with one that routes every key
		// through our keymap. Handling all keys here also keeps global hotkeys (Ctrl+P, Ctrl+N, ...)
		// from firing while the picker is open.
		this.scope = new Scope(this.app.scope);
		this.scope.register(null, null, (evt) => this.handleKey(evt));
	}

	// ---- subclass hooks -------------------------------------------------------

	/** All candidate items for the current state. */
	protected abstract loadItems(): TAbstractFile[];
	/** Text used for fuzzy matching and display highlighting. */
	protected abstract matchText(file: TAbstractFile): string;
	/** Label shown in the prompt line (e.g. current folder). */
	protected abstract promptLabel(): string;
	/** Render a row; `result.matches` refer to `matchText(file)`. */
	protected abstract renderRow(row: HTMLElement, result: Result): void;
	/** Handle picker-specific actions. Return false if the action is not handled. */
	protected abstract runPickerAction(action: ActionId): Promise<ActionOutcome | false> | ActionOutcome | false;
	/** Called when "open" targets a folder. */
	protected abstract openFolder(folder: TFolder): void;

	/** Order fuzzy-matched results (default: name matches first, then by score). */
	protected sortForQuery(results: (Result & { score: number; nameHit: boolean })[]): Result[] {
		return results.sort((a, b) => Number(b.nameHit) - Number(a.nameHit) || b.score - a.score);
	}

	/** Show `result` in the preview pane. */
	protected showPreview(result: Result | null): void {
		this.preview?.show(result?.file ?? null);
	}

	/** Text shown when there are no results. */
	protected emptyText(): string {
		return this.items.length === 0 ? "(empty)" : "No matches";
	}

	/** Cursor position for an opened file; `result` is the row it was opened from, if any. */
	protected jumpTarget(_file: TFile, _result?: Result): JumpTarget | undefined {
		return undefined;
	}

	/** Append picker-specific status (between the counters and the key hints). */
	protected renderStatusExtra(_el: HTMLElement): void {}

	// ---- lifecycle --------------------------------------------------------------

	onOpen(): void {
		this.compiled = compileKeymap(this.plugin.settings.keymap, scopesFor(this.pickerKind));
		this.modalEl.addClass("keyfiler-modal");
		if (!this.plugin.settings.showPreview) this.modalEl.addClass("keyfiler-no-preview");
		this.titleEl.remove();
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("keyfiler-root");

		const promptEl = contentEl.createDiv({ cls: "keyfiler-prompt" });
		this.modeEl = promptEl.createSpan({ cls: "keyfiler-mode" });
		this.labelEl = promptEl.createSpan({ cls: "keyfiler-label" });
		this.inputEl = promptEl.createEl("input", {
			cls: "keyfiler-input",
			attr: { type: "text", spellcheck: "false", autocomplete: "off" },
		});
		this.inputEl.value = this.initialQuery;
		this.inputEl.addEventListener("input", () => {
			if (!this.prompt) this.updateResults(true);
		});

		const body = contentEl.createDiv({ cls: "keyfiler-body" });
		this.listEl = body.createDiv({ cls: "keyfiler-list" });
		this.previewEl = body.createDiv({ cls: "keyfiler-preview" });
		if (this.plugin.settings.showPreview) this.preview = new Preview(this.app, this.previewEl);
		this.statusEl = contentEl.createDiv({ cls: "keyfiler-status" });

		this.refresh();
		this.setMode(this.mode);
		this.inputEl.focus();
	}

	onClose(): void {
		this.preview?.destroy();
		this.preview = null;
		this.contentEl.empty();
	}

	// ---- state updates -------------------------------------------------------------

	/** Reload items and re-filter, keeping the cursor on `focusPath` (or the same item) when possible. */
	protected refresh(focusPath?: string): void {
		const keep = focusPath ?? this.current()?.path;
		this.items = this.loadItems();
		// drop marks for files that no longer exist
		for (const p of [...this.marked]) {
			if (!this.app.vault.getAbstractFileByPath(p)) this.marked.delete(p);
		}
		this.updateResults(false, keep);
		this.preview?.refresh();
	}

	protected get query(): string {
		return this.prompt ? this.prompt.savedQuery : this.inputEl.value;
	}

	protected setQuery(q: string): void {
		if (this.prompt) this.prompt.savedQuery = q;
		else this.inputEl.value = q;
	}

	protected updateResults(resetCursor: boolean, focusPath?: string): void {
		const q = this.query.trim();
		if (!q) {
			this.results = this.items.map((file) => ({ file, text: this.matchText(file), matches: [] }));
		} else {
			const fuzzy = prepareFuzzySearch(q);
			const scored: (Result & { score: number; nameHit: boolean })[] = [];
			for (const file of this.items) {
				const text = this.matchText(file);
				const m = fuzzy(text);
				if (!m) continue;
				scored.push({
					file,
					text,
					matches: m.matches as [number, number][],
					score: m.score,
					nameHit: text === file.name || fuzzy(file.name) !== null,
				});
			}
			this.results = this.sortForQuery(scored);
		}
		this.setResults(this.results, resetCursor, focusPath);
	}

	/** Replace the results, placing the cursor on `focusPath`, at the top, or where it was. */
	protected setResults(results: Result[], resetCursor: boolean, focusPath?: string): void {
		this.results = results;
		if (focusPath) {
			const i = this.results.findIndex((r) => r.file.path === focusPath);
			this.cursor = i >= 0 ? i : Math.min(this.cursor, Math.max(0, this.results.length - 1));
		} else if (resetCursor) {
			this.cursor = 0;
		} else {
			this.cursor = Math.min(this.cursor, Math.max(0, this.results.length - 1));
		}
		this.renderList();
	}

	protected current(): TAbstractFile | null {
		return this.results[this.cursor]?.file ?? null;
	}

	/** Marked items that still exist, or the item under the cursor when nothing is marked. */
	protected targets(): TAbstractFile[] {
		if (this.marked.size > 0) {
			return [...this.marked]
				.map((p) => this.app.vault.getAbstractFileByPath(p))
				.filter((f): f is TAbstractFile => f !== null);
		}
		const cur = this.current();
		return cur ? [cur] : [];
	}

	protected markedFiles(): TAbstractFile[] {
		return [...this.marked]
			.map((p) => this.app.vault.getAbstractFileByPath(p))
			.filter((f): f is TAbstractFile => f !== null);
	}

	protected setMode(mode: Mode): void {
		this.mode = mode;
		this.pending = [];
		this.modalEl.toggleClass("keyfiler-mode-normal", mode === "normal");
		this.modalEl.toggleClass("keyfiler-mode-insert", mode === "insert");
		if (mode === "normal" && this.plugin.settings.imeOffOnNormal) this.plugin.imeOff();
		this.renderPromptLine();
		this.renderStatus();
	}

	// ---- rendering ------------------------------------------------------------------

	protected renderPromptLine(): void {
		if (this.prompt) {
			this.modeEl.setText(this.prompt.kind === "confirm" ? "?" : ">");
			this.modeEl.className = "keyfiler-mode keyfiler-mode-prompt";
			this.labelEl.setText(this.prompt.label);
		} else {
			this.modeEl.setText(this.mode === "insert" ? "I" : "N");
			this.modeEl.className = `keyfiler-mode keyfiler-mode-${this.mode}`;
			this.labelEl.setText(this.promptLabel());
		}
	}

	protected renderList(): void {
		this.listEl.empty();
		const max = this.plugin.settings.maxResults;
		const shown = this.results.slice(0, max);
		if (shown.length === 0) {
			this.listEl.createDiv({ cls: "keyfiler-empty", text: this.emptyText() });
		}
		shown.forEach((result, i) => {
			const row = this.listEl.createDiv({ cls: "keyfiler-row" });
			if (i === this.cursor) row.addClass("is-selected");
			if (this.marked.has(result.file.path)) row.addClass("is-marked");
			row.createSpan({ cls: "keyfiler-mark", text: this.marked.has(result.file.path) ? "●" : "" });
			setIcon(row.createSpan({ cls: "keyfiler-icon" }), iconFor(result.file));
			this.renderRow(row, result);
			row.addEventListener("mousedown", (e) => e.preventDefault()); // keep input focus
			row.addEventListener("click", () => {
				this.cursor = i;
				void this.execute("open");
			});
		});
		this.updateSelection();
	}

	private updateSelection(): void {
		const rows = this.listEl.querySelectorAll<HTMLElement>(".keyfiler-row");
		rows.forEach((row, i) => row.toggleClass("is-selected", i === this.cursor));
		rows[this.cursor]?.scrollIntoView({ block: "nearest" });
		this.showPreview(this.results[this.cursor] ?? null);
		this.renderStatus();
	}

	protected renderStatus(): void {
		if (!this.statusEl) return;
		this.statusEl.empty();
		const total = this.results.length;
		const count = this.statusEl.createSpan({ cls: "keyfiler-count" });
		count.setText(total > 0 ? `${this.cursor + 1}/${total}` : "0/0");
		if (total > this.plugin.settings.maxResults) count.appendText(` (showing ${this.plugin.settings.maxResults})`);
		if (this.marked.size > 0) this.statusEl.createSpan({ cls: "keyfiler-marked-count", text: `● ${this.marked.size} marked` });
		this.renderStatusExtra(this.statusEl);
		const hints = this.statusEl.createSpan({ cls: "keyfiler-hints" });
		if (this.prompt) {
			hints.setText(this.prompt.kind === "confirm" ? "y: yes · any other key: cancel" : "Enter: confirm · Esc: cancel");
			return;
		}
		const hintActions = HINT_ACTIONS[this.pickerKind];
		const parts: string[] = [];
		for (const a of hintActions) {
			const key = this.compiled[this.mode].find((b) => b.action === a)?.seq.join("");
			if (key) parts.push(`${key} ${shortName(a)}`);
		}
		hints.setText(parts.join(" · "));
	}

	// ---- key handling ---------------------------------------------------------------

	private handleKey(evt: KeyboardEvent): boolean {
		// Never interpret keys while an IME is composing (e.g. Japanese input confirming with Enter).
		if (evt.isComposing || evt.keyCode === 229) return true;
		// Only handle keys aimed at this modal (not at e.g. a notice or another window).
		if (!this.modalEl.isConnected) return true;

		if (this.prompt) return this.handlePromptKey(evt);

		const stroke = eventToString(evt);
		if (!stroke) return true;
		const r = resolve(this.compiled, this.mode, this.pending, stroke);
		this.pending = r.pending;
		if (r.action) {
			const action = r.action;
			const outcome = this.execute(action);
			if (outcome === PASS) return true;
			return false;
		}
		if (r.consumed) return false; // prefix of a sequence
		// Unbound key: in Normal mode swallow printable keys so they don't edit the query.
		if (this.mode === "normal" && !evt.ctrlKey && !evt.metaKey && !evt.altKey) {
			if (evt.key.length === 1 || evt.key === "Backspace" || evt.key === "Delete" || evt.key === "Enter") return false;
		}
		return true; // let the input handle it; returning true also keeps parent (global) hotkeys from running
	}

	private handlePromptKey(evt: KeyboardEvent): boolean {
		const p = this.prompt;
		if (!p) return true;
		if (p.kind === "confirm") {
			if (evt.key === "Shift" || evt.key === "Control" || evt.key === "Alt" || evt.key === "Meta") return false;
			const yes = evt.key === "y" || evt.key === "Y";
			this.endPrompt();
			if (yes) void Promise.resolve(p.onSubmit("y"));
			return false;
		}
		if (evt.key === "Escape") {
			this.endPrompt();
			return false;
		}
		if (evt.key === "Enter") {
			const value = this.inputEl.value;
			this.endPrompt();
			void Promise.resolve(p.onSubmit(value));
			return false;
		}
		return true;
	}

	/** Switch the input line into a text prompt (or a y/N confirmation). */
	protected startPrompt(
		kind: "text" | "confirm",
		label: string,
		initial: string,
		onSubmit: (value: string) => void | Promise<void>,
		select?: [number, number],
	): void {
		this.prompt = { kind, label, savedQuery: this.inputEl.value, onSubmit };
		this.modalEl.addClass("keyfiler-prompting");
		this.inputEl.value = kind === "confirm" ? "" : initial;
		this.inputEl.readOnly = kind === "confirm";
		this.inputEl.focus();
		if (select) this.inputEl.setSelectionRange(select[0], select[1]);
		this.renderPromptLine();
		this.renderStatus();
	}

	protected endPrompt(): void {
		const p = this.prompt;
		if (!p) return;
		this.prompt = null;
		this.modalEl.removeClass("keyfiler-prompting");
		this.inputEl.readOnly = false;
		this.inputEl.value = p.savedQuery;
		this.renderPromptLine();
		this.renderStatus();
	}

	// ---- actions --------------------------------------------------------------------

	protected execute(action: ActionId): ActionOutcome {
		const outcome = this.runCommonAction(action);
		if (outcome !== false) return outcome;
		const picker = this.runPickerAction(action);
		if (picker instanceof Promise) {
			picker.catch((e) => new Notice(`Keyfiler: ${e instanceof Error ? e.message : String(e)}`));
			return;
		}
		if (picker === false) console.warn(`Keyfiler: unhandled action ${action} (${ACTIONS[action].desc})`);
		return picker === false ? undefined : picker;
	}

	private runCommonAction(action: ActionId): ActionOutcome | false {
		switch (action) {
			case "moveDown":
				return this.moveCursor(1);
			case "moveUp":
				return this.moveCursor(-1);
			case "halfPageDown":
				return this.moveCursor(this.halfPage());
			case "halfPageUp":
				return this.moveCursor(-this.halfPage());
			case "first":
				return this.setCursor(0);
			case "last":
				return this.setCursor(this.visibleCount() - 1);
			case "open":
				return this.openSelection(this.plugin.settings.openIn === "tab" ? "tab" : "default");
			case "openTab":
				return this.openSelection("tab");
			case "openVsplit":
				return this.openSelection("vsplit");
			case "openHsplit":
				return this.openSelection("hsplit");
			case "toggleMarkNext":
				return this.toggleMark(1);
			case "toggleMarkPrev":
				return this.toggleMark(-1);
			case "clearMarks":
				this.marked.clear();
				this.renderList();
				return;
			case "previewDown":
				this.preview?.scroll(1);
				return;
			case "previewUp":
				this.preview?.scroll(-1);
				return;
			case "toNormal":
				return this.setMode("normal");
			case "toInsert":
				return this.setMode("insert");
			case "close":
				return this.close();
			default:
				return false;
		}
	}

	private visibleCount(): number {
		return Math.min(this.results.length, this.plugin.settings.maxResults);
	}

	private halfPage(): number {
		const row = this.listEl.querySelector<HTMLElement>(".keyfiler-row");
		const h = row?.offsetHeight || 28;
		return Math.max(1, Math.floor(this.listEl.clientHeight / h / 2));
	}

	protected setCursor(i: number): void {
		const n = this.visibleCount();
		if (n === 0) return;
		this.cursor = Math.max(0, Math.min(n - 1, i));
		this.updateSelection();
	}

	private moveCursor(delta: number): void {
		this.setCursor(this.cursor + delta);
	}

	private toggleMark(delta: 1 | -1): void {
		const cur = this.current();
		if (!cur) return;
		if (this.marked.has(cur.path)) this.marked.delete(cur.path);
		else this.marked.add(cur.path);
		const n = this.visibleCount();
		this.cursor = Math.max(0, Math.min(n - 1, this.cursor + delta));
		this.renderList();
	}

	/** Enter the folder under the cursor; otherwise open marked files (if any) or the file under the cursor. */
	private openSelection(how: OpenHow): void {
		const cur = this.current();
		if (cur instanceof TFolder) {
			this.openFolder(cur);
			return;
		}
		const marked = this.markedFiles().filter((f): f is TFile => f instanceof TFile);
		if (marked.length > 0) {
			const multi = how === "default" ? "tab" : how;
			marked.forEach((f, i) => void this.openFile(f, i === 0 && how === "default" ? "default" : multi));
			this.close();
			return;
		}
		if (cur instanceof TFile) {
			void this.openFile(cur, how, this.results[this.cursor]);
			this.close();
		}
	}

	protected async openFile(file: TFile, how: OpenHow, result?: Result): Promise<void> {
		const ws = this.app.workspace;
		const leaf =
			how === "tab"
				? ws.getLeaf("tab")
				: how === "vsplit"
					? ws.getLeaf("split", "vertical")
					: how === "hsplit"
						? ws.getLeaf("split", "horizontal")
						: ws.getLeaf(false);
		const target = this.jumpTarget(file, result);
		await leaf.openFile(file, target ? { eState: { line: target.line } } : undefined);
		ws.setActiveLeaf(leaf, { focus: true });
		if (target) jumpTo(leaf, target);
	}
}

/** Put the editor cursor on `target` and scroll it to the middle of the view. */
function jumpTo(leaf: WorkspaceLeaf, target: JumpTarget): void {
	const view = leaf.view;
	if (!(view instanceof MarkdownView) || view.getMode() !== "source") return;
	const { editor } = view;
	const from = { line: target.line, ch: target.from };
	// A collapsed cursor (not a selection) so vim mode stays in Normal mode.
	editor.setCursor(from);
	editor.scrollIntoView({ from, to: { line: target.line, ch: target.to } }, true);
}

const HINT_ACTIONS: Record<PickerKind, ActionId[]> = {
	browser: ["open", "goParent", "toggleMarkNext", "create", "rename", "moveMarked", "copyMarked", "delete", "switchToFind", "grepInFolder"],
	find: ["open", "openTab", "openVsplit", "toggleMarkNext", "revealInBrowser", "switchToGrep"],
	grep: ["open", "openTab", "openVsplit", "toggleMarkNext", "toggleRegex", "grepToFind", "revealInBrowser"],
};

function iconFor(file: TAbstractFile): string {
	if (file instanceof TFolder) return "folder";
	if (!(file instanceof TFile)) return "file";
	switch (file.extension.toLowerCase()) {
		case "md":
			return "file-text";
		case "canvas":
			return "layout-dashboard";
		case "pdf":
			return "file-type";
		case "png":
		case "jpg":
		case "jpeg":
		case "gif":
		case "svg":
		case "webp":
		case "bmp":
		case "avif":
			return "image";
		case "mp3":
		case "wav":
		case "m4a":
		case "ogg":
		case "flac":
			return "file-audio";
		case "mp4":
		case "webm":
		case "mov":
			return "file-video";
		default:
			return "file";
	}
}

function shortName(a: ActionId): string {
	const names: Partial<Record<ActionId, string>> = {
		open: "open",
		openTab: "tab",
		openVsplit: "vsplit",
		goParent: "up",
		toggleMarkNext: "mark",
		create: "new",
		rename: "rename",
		moveMarked: "move",
		copyMarked: "copy",
		delete: "delete",
		switchToFind: "find",
		grepInFolder: "grep",
		switchToGrep: "grep",
		toggleRegex: "regex",
		grepToFind: "find",
		revealInBrowser: "browse",
	};
	return names[a] ?? a;
}
