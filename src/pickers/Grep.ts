import { TAbstractFile, TFile, TFolder } from "obsidian";
import type KeyfilerPlugin from "../main";
import { buildMatcher, clipLine, searchText } from "../grep/match";
import { PickerModal, renderHighlighted, type ActionOutcome, type JumpTarget, type PickerOptions, type Result } from "../ui/PickerModal";
import type { ActionId } from "../ui/keymap";
import { TEXT_EXTS } from "../ui/preview";
import { isRoot } from "../util/path";
import { listFiles } from "../util/vaultFiles";
import { revealInBrowser } from "./FileBrowser";
import { FindFilesModal } from "./FindFiles";

/** Stop searching after this many matching lines. */
const MAX_MATCHES = 2000;
const DEBOUNCE_MS = 120;
/** Yield to the UI (and render partial results) after this much search time. */
const SLICE_MS = 10;
/** Characters of a matching line shown in the list. */
const LINE_WIDTH = 160;

export interface GrepOptions extends PickerOptions {
	/** Restrict the search to this folder (vault path). Defaults to the whole vault. */
	root?: string;
}

type SearchState = "idle" | "searching" | "done" | "limit" | "error";

/** Live full-text search: one row per matching line, re-run as the query changes. */
export class GrepModal extends PickerModal {
	protected readonly pickerKind = "grep";
	private root: string;
	private regex = false;
	private state: SearchState = "idle";
	private error = "";
	private timer: number | null = null;
	/** Incremented to cancel the running search. */
	private token = 0;

	constructor(plugin: KeyfilerPlugin, opts: GrepOptions = {}) {
		super(plugin, opts);
		this.root = opts.root && !isRoot(opts.root) ? opts.root : "/";
	}

	onClose(): void {
		this.cancel();
		super.onClose();
	}

	protected loadItems(): TAbstractFile[] {
		return listFiles(this.app, this.root, (f) => {
			const ext = f.extension.toLowerCase();
			return ext === "md" || TEXT_EXTS.has(ext);
		});
	}

	protected matchText(file: TAbstractFile): string {
		return file.path;
	}

	protected promptLabel(): string {
		const label = this.regex ? "Grep (regex)" : "Grep";
		return isRoot(this.root) ? label : `${label} in ${this.root}/`;
	}

	protected emptyText(): string {
		if (this.query.trim() === "") return "Type to search";
		if (this.state === "searching") return "Searching…";
		if (this.state === "error") return "Invalid regular expression";
		return "No matches";
	}

	protected renderStatusExtra(el: HTMLElement): void {
		if (this.state === "searching") el.createSpan({ cls: "keyfiler-grep-state", text: "searching…" });
		else if (this.state === "limit") el.createSpan({ cls: "keyfiler-grep-state", text: `stopped at ${MAX_MATCHES} matches` });
		else if (this.state === "error") el.createSpan({ cls: "keyfiler-grep-error", text: this.error });
	}

	protected renderRow(row: HTMLElement, result: Result): void {
		const { file } = result;
		row.addClass("keyfiler-grep-row");
		row.title = file.path;
		const loc = row.createSpan({ cls: "keyfiler-grep-loc" });
		const dir = file.parent && !file.parent.isRoot() ? `${file.parent.path}/` : "";
		if (dir) loc.createSpan({ cls: "keyfiler-dir", text: dir });
		loc.createSpan({ cls: "keyfiler-name", text: file.name });
		loc.createSpan({ cls: "keyfiler-grep-lnum", text: `:${(result.line ?? 0) + 1}` });
		const clipped = clipLine(result.text, result.matches, LINE_WIDTH);
		renderHighlighted(row.createSpan({ cls: "keyfiler-grep-text" }), clipped.text, clipped.ranges);
	}

	protected showPreview(result: Result | null): void {
		if (!result || result.line === undefined) {
			this.preview?.show(result?.file ?? null);
			return;
		}
		this.preview?.show(result.file, { line: result.line, ranges: result.matches });
	}

	protected jumpTarget(file: TFile, result?: Result): JumpTarget | undefined {
		// opening marked files: jump to each file's first hit
		const r = result ?? this.results.find((x) => x.file === file);
		if (!r || r.line === undefined) return undefined;
		const [from, to] = r.matches[0] ?? [0, 0];
		return { line: r.line, from, to };
	}

	protected openFolder(_folder: TFolder): void {
		// grep results only contain files
	}

	protected runPickerAction(action: ActionId): ActionOutcome | false {
		switch (action) {
			case "toggleRegex":
				this.regex = !this.regex;
				this.renderPromptLine();
				this.updateResults(true);
				return;
			case "grepToFind":
				this.close();
				new FindFilesModal(this.plugin, { root: this.root, query: this.query, marked: this.marked }).open();
				return;
			case "revealInBrowser":
				this.close();
				return revealInBrowser(this.plugin, this.current(), this.marked);
			default:
				return false;
		}
	}

	// ---- search ---------------------------------------------------------------------

	private cancel(): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = null;
		this.token++;
	}

	protected updateResults(resetCursor: boolean, focusPath?: string): void {
		this.cancel();
		const query = this.query;
		if (query.trim() === "") {
			this.state = "idle";
			this.setResults([], true);
			return;
		}
		const matcher = buildMatcher(query, this.regex);
		if ("error" in matcher) {
			// keep the previous results while the pattern is being typed
			this.state = "error";
			this.error = matcher.error;
			if (this.results.length === 0) this.renderList();
			this.renderStatus();
			return;
		}
		this.state = "searching";
		this.renderStatus();
		const token = this.token;
		this.timer = window.setTimeout(() => {
			this.timer = null;
			void this.search(matcher.re, token, resetCursor, focusPath);
		}, DEBOUNCE_MS);
	}

	private async search(re: RegExp, token: number, resetCursor: boolean, focusPath?: string): Promise<void> {
		const results: Result[] = [];
		let published = false;
		const publish = () => {
			// the first batch replaces the previous query's results (and resets the cursor);
			// later batches only append, so the cursor index stays on the same row
			this.setResults(results.slice(), !published && resetCursor, published ? undefined : focusPath);
			published = true;
		};
		let sliceStart = performance.now();
		for (const item of this.items) {
			if (!(item instanceof TFile)) continue;
			let text: string;
			try {
				text = await this.plugin.textCache.read(item);
			} catch {
				continue;
			}
			if (token !== this.token) return;
			for (const hit of searchText(text, re, MAX_MATCHES - results.length)) {
				results.push({ file: item, text: hit.text, matches: hit.ranges, line: hit.line });
			}
			if (results.length >= MAX_MATCHES) break;
			if (performance.now() - sliceStart > SLICE_MS) {
				publish();
				await new Promise((r) => window.setTimeout(r, 0));
				if (token !== this.token) return;
				sliceStart = performance.now();
			}
		}
		this.state = results.length >= MAX_MATCHES ? "limit" : "done";
		publish();
	}
}
