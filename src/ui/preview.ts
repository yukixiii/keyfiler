import { App, Component, MarkdownRenderer, TAbstractFile, TFile, TFolder, setIcon } from "obsidian";
import { renderHighlighted } from "./highlight";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "avif"]);
export const TEXT_EXTS = new Set(["txt", "json", "canvas", "csv", "tsv", "js", "ts", "css", "html", "yaml", "yml", "xml", "log", "base"]);
const MAX_CHARS = 5000;
const DEBOUNCE_MS = 100;
/** Lines shown above and below the target line of a location preview. */
const CONTEXT_LINES = 100;

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A line in a file to preview, with matched ranges on that line. */
export interface PreviewLocation {
	line: number;
	ranges: [number, number][];
}

export class Preview {
	private component: Component | null = null;
	private timer: number | null = null;
	private token = 0;
	private current: TAbstractFile | null = null;
	private loc: PreviewLocation | undefined;

	constructor(
		private app: App,
		private el: HTMLElement,
	) {}

	/** Schedule rendering of `file` (debounced); with `loc`, show the lines around it as plain text. */
	show(file: TAbstractFile | null, loc?: PreviewLocation): void {
		if (file === this.current && loc?.line === this.loc?.line) return;
		this.current = file;
		this.loc = loc;
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => {
			this.timer = null;
			void this.render(file, loc);
		}, DEBOUNCE_MS);
	}

	/** Force re-render of the current item (e.g. after a file operation). */
	refresh(): void {
		const file = this.current;
		const loc = this.loc;
		this.current = null;
		this.show(file, loc);
	}

	scroll(direction: 1 | -1): void {
		this.el.scrollBy({ top: (direction * this.el.clientHeight) / 2 });
	}

	destroy(): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.token++;
		this.component?.unload();
		this.component = null;
	}

	private async render(file: TAbstractFile | null, loc?: PreviewLocation): Promise<void> {
		const token = ++this.token;
		this.component?.unload();
		this.component = null;
		this.el.empty();
		this.el.scrollTop = 0;
		if (!file) return;

		if (file instanceof TFolder) {
			this.renderFolder(file);
			return;
		}
		if (!(file instanceof TFile)) return;

		const ext = file.extension.toLowerCase();
		if (loc) {
			const text = await this.app.vault.cachedRead(file);
			if (token !== this.token) return;
			this.renderLines(text, loc);
		} else if (ext === "md") {
			const text = await this.app.vault.cachedRead(file);
			if (token !== this.token) return;
			const component = new Component();
			component.load();
			this.component = component;
			const body = this.el.createDiv({ cls: "keyfiler-preview-md markdown-rendered" });
			await MarkdownRenderer.render(this.app, text.slice(0, MAX_CHARS), body, file.path, component);
		} else if (IMAGE_EXTS.has(ext)) {
			this.el.createEl("img", { cls: "keyfiler-preview-img", attr: { src: this.app.vault.getResourcePath(file) } });
		} else if (TEXT_EXTS.has(ext)) {
			const text = await this.app.vault.cachedRead(file);
			if (token !== this.token) return;
			this.el.createEl("pre", { cls: "keyfiler-preview-text", text: text.slice(0, MAX_CHARS) });
		} else {
			this.renderInfo(file);
		}
	}

	private renderLines(text: string, loc: PreviewLocation): void {
		const lines = text.split("\n");
		const start = Math.max(0, loc.line - CONTEXT_LINES);
		const end = Math.min(lines.length, loc.line + CONTEXT_LINES + 1);
		const width = String(end).length;
		const box = this.el.createDiv({ cls: "keyfiler-preview-lines" });
		let hitEl: HTMLElement | null = null;
		for (let i = start; i < end; i++) {
			const row = box.createDiv({ cls: "keyfiler-preview-line" });
			row.createSpan({ cls: "keyfiler-preview-lineno", text: String(i + 1).padStart(width) });
			const body = row.createSpan({ cls: "keyfiler-preview-linetext" });
			const line = lines[i].replace(/\r$/, "");
			if (i === loc.line) {
				hitEl = row;
				row.addClass("is-hit");
				renderHighlighted(body, line, loc.ranges);
			} else {
				body.setText(line);
			}
		}
		// center the target line
		// (.keyfiler-preview is position: relative, so offsetTop is relative to it)
		if (hitEl) this.el.scrollTop = hitEl.offsetTop - (this.el.clientHeight - hitEl.offsetHeight) / 2;
	}

	private renderFolder(folder: TFolder): void {
		const children = [...folder.children].sort((a, b) => {
			const fa = a instanceof TFolder ? 0 : 1;
			const fb = b instanceof TFolder ? 0 : 1;
			return fa - fb || a.name.localeCompare(b.name, undefined, { numeric: true });
		});
		if (children.length === 0) {
			this.el.createDiv({ cls: "keyfiler-preview-empty", text: "(empty folder)" });
			return;
		}
		const list = this.el.createDiv({ cls: "keyfiler-preview-folder" });
		for (const child of children) {
			const row = list.createDiv({ cls: "keyfiler-preview-folder-row" });
			setIcon(row.createSpan({ cls: "keyfiler-icon" }), child instanceof TFolder ? "folder" : "file");
			row.createSpan({ text: child instanceof TFolder ? `${child.name}/` : child.name });
		}
	}

	private renderInfo(file: TFile): void {
		const info = this.el.createDiv({ cls: "keyfiler-preview-info" });
		setIcon(info.createDiv({ cls: "keyfiler-preview-info-icon" }), "file");
		info.createDiv({ cls: "keyfiler-preview-info-name", text: file.name });
		info.createDiv({ text: formatSize(file.stat.size) });
		info.createDiv({ text: `Modified: ${new Date(file.stat.mtime).toLocaleString()}` });
	}
}
