// Pure keymap logic. Must not import from "obsidian" so it can be unit-tested.

export type Mode = "insert" | "normal";
export type ActionScope = "common" | "browser" | "find" | "grep";
export type PickerKind = Exclude<ActionScope, "common">;

export interface ActionDef {
	desc: string;
	/** Pickers the action is available in ("common" = all). */
	scope: ActionScope | readonly ActionScope[];
}

export const ACTIONS = {
	moveDown: { desc: "Move cursor down", scope: "common" },
	moveUp: { desc: "Move cursor up", scope: "common" },
	halfPageDown: { desc: "Move cursor half a page down", scope: "common" },
	halfPageUp: { desc: "Move cursor half a page up", scope: "common" },
	first: { desc: "Jump to first item", scope: "common" },
	last: { desc: "Jump to last item", scope: "common" },
	open: { desc: "Open file / enter folder", scope: "common" },
	openVsplit: { desc: "Open in vertical split", scope: "common" },
	openHsplit: { desc: "Open in horizontal split", scope: "common" },
	openTab: { desc: "Open in new tab", scope: "common" },
	toggleMarkNext: { desc: "Toggle mark and move down", scope: "common" },
	toggleMarkPrev: { desc: "Toggle mark and move up", scope: "common" },
	clearMarks: { desc: "Clear all marks", scope: "common" },
	previewDown: { desc: "Scroll preview down", scope: "common" },
	previewUp: { desc: "Scroll preview up", scope: "common" },
	toNormal: { desc: "Switch to Normal mode", scope: "common" },
	toInsert: { desc: "Switch to Insert mode", scope: "common" },
	close: { desc: "Close", scope: "common" },
	revealInBrowser: { desc: "Open file browser at the item's folder", scope: ["find", "grep"] },
	switchToGrep: { desc: "Grep in the same scope (keeps the query)", scope: "find" },
	toggleRegex: { desc: "Toggle regular expression mode", scope: "grep" },
	grepToFind: { desc: "Find files in the same scope (keeps the query)", scope: "grep" },
	goParent: { desc: "Go to parent folder (Backspace only when query is empty)", scope: "browser" },
	create: { desc: "Create file / folder (trailing / = folder)", scope: "browser" },
	rename: { desc: "Rename item", scope: "browser" },
	moveMarked: { desc: "Move marked items to current folder", scope: "browser" },
	copyMarked: { desc: "Copy marked items to current folder", scope: "browser" },
	delete: { desc: "Delete marked items (or item under cursor)", scope: "browser" },
	goRoot: { desc: "Go to vault root", scope: "browser" },
	goCurrent: { desc: "Go to folder of the active file", scope: "browser" },
	switchToFind: { desc: "Find files under current folder", scope: "browser" },
	grepInFolder: { desc: "Grep under current folder", scope: "browser" },
} as const satisfies Record<string, ActionDef>;

export type ActionId = keyof typeof ACTIONS;
export const ACTION_IDS = Object.keys(ACTIONS) as ActionId[];

export interface Binding {
	insert: string[];
	normal: string[];
}
export type Keymap = Record<ActionId, Binding>;

export const DEFAULT_KEYMAP: Keymap = {
	moveDown: { insert: ["<Down>", "<C-n>", "<C-j>"], normal: ["j", "<Down>", "<C-n>", "<C-j>"] },
	moveUp: { insert: ["<Up>", "<C-p>", "<C-k>"], normal: ["k", "<Up>", "<C-p>", "<C-k>"] },
	halfPageDown: { insert: [], normal: ["<C-d>"] },
	halfPageUp: { insert: [], normal: ["<C-u>"] },
	first: { insert: [], normal: ["gg", "<Home>"] },
	last: { insert: [], normal: ["G", "<End>"] },
	open: { insert: ["<CR>"], normal: ["<CR>", "l"] },
	openVsplit: { insert: ["<C-v>"], normal: ["<C-v>"] },
	openHsplit: { insert: ["<C-x>"], normal: ["<C-x>"] },
	openTab: { insert: ["<C-t>"], normal: ["<C-t>", "t"] },
	toggleMarkNext: { insert: ["<Tab>"], normal: ["<Tab>", "<Space>"] },
	toggleMarkPrev: { insert: ["<S-Tab>"], normal: ["<S-Tab>"] },
	clearMarks: { insert: [], normal: ["u"] },
	previewDown: { insert: ["<C-d>"], normal: ["<C-f>"] },
	previewUp: { insert: ["<C-u>"], normal: ["<C-b>"] },
	toNormal: { insert: ["<Esc>"], normal: [] },
	toInsert: { insert: [], normal: ["i", "a", "/"] },
	close: { insert: ["<C-c>"], normal: ["<Esc>", "q"] },
	revealInBrowser: { insert: ["<A-b>"], normal: ["b"] },
	switchToGrep: { insert: ["<C-g>"], normal: ["s"] },
	toggleRegex: { insert: ["<C-r>"], normal: ["R"] },
	grepToFind: { insert: ["<C-f>"], normal: ["f"] },
	goParent: { insert: ["<C-h>", "<BS>"], normal: ["h", "-", "<BS>"] },
	create: { insert: ["<A-c>"], normal: ["c"] },
	rename: { insert: ["<A-r>"], normal: ["r"] },
	moveMarked: { insert: ["<A-m>"], normal: ["m"] },
	copyMarked: { insert: ["<A-y>"], normal: ["y"] },
	delete: { insert: ["<A-d>"], normal: ["d"] },
	goRoot: { insert: ["<A-e>"], normal: ["e"] },
	goCurrent: { insert: ["<A-w>"], normal: ["w"] },
	switchToFind: { insert: ["<C-f>"], normal: ["f"] },
	grepInFolder: { insert: ["<C-g>"], normal: ["s"] },
};

// ---------------------------------------------------------------------------
// Key strokes

export interface KeyStroke {
	key: string; // single character, or a canonical special-key name (e.g. "Tab")
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
	meta: boolean;
}

/** Minimal shape of a KeyboardEvent needed for normalization. */
export interface KeyEventLike {
	key: string;
	code?: string;
	ctrlKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
	metaKey: boolean;
}

// notation name (lowercase) -> canonical name
const SPECIAL_NAMES: Record<string, string> = {
	cr: "CR", enter: "CR", return: "CR",
	esc: "Esc", escape: "Esc",
	tab: "Tab",
	space: "Space",
	bs: "BS", backspace: "BS",
	del: "Del", delete: "Del",
	up: "Up", down: "Down", left: "Left", right: "Right",
	home: "Home", end: "End",
	pageup: "PageUp", pagedown: "PageDown",
	lt: "<", comma: ",", bar: "|", bslash: "\\",
};

// characters that must be written by name in notation
const CHAR_NAMES: Record<string, string> = { "<": "lt", ",": "comma" };

// KeyboardEvent.key -> canonical name
const EVENT_KEY_NAMES: Record<string, string> = {
	Enter: "CR", Escape: "Esc", Tab: "Tab", " ": "Space", Backspace: "BS", Delete: "Del",
	ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
	Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
};

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "AltGraph", "CapsLock", "OS"]);

function isSingleChar(key: string): boolean {
	return [...key].length === 1;
}

/** Canonical string for a stroke, e.g. "j", "G", "<C-n>", "<S-Tab>", "<Space>". */
export function strokeToString(s: KeyStroke): string {
	const char = isSingleChar(s.key) && !CHAR_NAMES[s.key];
	const hasMod = s.ctrl || s.alt || s.meta;
	// Shift is already reflected in printable characters ("G" vs "g") unless other modifiers are held.
	const shift = s.shift && (!isSingleChar(s.key) || hasMod);
	if (char && !hasMod && !shift) return s.key;
	const key = char && hasMod ? s.key.toLowerCase() : (CHAR_NAMES[s.key] ?? s.key);
	let mods = "";
	if (s.ctrl) mods += "C-";
	if (s.alt) mods += "A-";
	if (s.shift && shift) mods += "S-";
	if (s.meta) mods += "D-";
	return `<${mods}${key}>`;
}

/**
 * Normalize a keyboard event into a canonical stroke string.
 * Returns null for pure modifier presses.
 */
export function eventToString(e: KeyEventLike): string | null {
	if (MODIFIER_KEYS.has(e.key)) return null;
	let key = EVENT_KEY_NAMES[e.key] ?? e.key;
	// With Ctrl/Alt held, layouts (and macOS Option) may produce odd characters; prefer the physical key.
	if ((e.altKey || e.ctrlKey) && e.code) {
		if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase();
		else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
	}
	if (!EVENT_KEY_NAMES[e.key] && !isSingleChar(key)) return null; // unsupported (F-keys etc.)
	return strokeToString({ key, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey });
}

/** Parse one "<...>" body like "C-S-v" or "Tab" into a stroke. */
function parseAngle(body: string): KeyStroke | null {
	const s: KeyStroke = { key: "", ctrl: false, alt: false, shift: false, meta: false };
	let rest = body;
	for (;;) {
		const m = /^([CcAaMmSsDd])-(.+)$/.exec(rest);
		if (!m) break;
		const mod = m[1].toUpperCase();
		if (mod === "C") s.ctrl = true;
		else if (mod === "A" || mod === "M") s.alt = true;
		else if (mod === "S") s.shift = true;
		else s.meta = true;
		rest = m[2];
	}
	if (isSingleChar(rest)) {
		s.key = rest;
	} else {
		const name = SPECIAL_NAMES[rest.toLowerCase()];
		if (!name) return null;
		s.key = name;
	}
	return s;
}

/**
 * Parse a key sequence in vim notation ("gg", "<C-n>", "<Space>", "j") into canonical strokes.
 * Returns null if the notation is invalid.
 */
export function parseSequence(notation: string): string[] | null {
	const text = notation.trim();
	if (!text) return null;
	const out: string[] = [];
	let i = 0;
	const chars = [...text];
	while (i < chars.length) {
		const c = chars[i];
		if (c === "<") {
			const close = chars.indexOf(">", i + 1);
			if (close === -1) return null;
			const stroke = parseAngle(chars.slice(i + 1, close).join(""));
			if (!stroke) return null;
			out.push(strokeToString(stroke));
			i = close + 1;
		} else if (c === " ") {
			return null; // use <Space>
		} else {
			out.push(strokeToString({ key: c, ctrl: false, alt: false, shift: false, meta: false }));
			i++;
		}
	}
	return out;
}

/** Split a settings text field ("<C-n>, <Down>, j") into notations. A comma key is written "<comma>". */
export function splitNotations(text: string): string[] {
	return text
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// Resolution

export interface CompiledBinding {
	seq: string[];
	action: ActionId;
}
export type CompiledKeymap = Record<Mode, CompiledBinding[]>;

export function scopesFor(picker: PickerKind): ActionScope[] {
	return ["common", picker];
}

/** Scopes of an action as a list. */
export function actionScopes(id: ActionId): readonly ActionScope[] {
	const scope: ActionDef["scope"] = ACTIONS[id].scope;
	return typeof scope === "string" ? [scope] : scope;
}

/** Compile a keymap for the given action scopes. Invalid notations are skipped. */
export function compileKeymap(keymap: Keymap, scopes: ActionScope[]): CompiledKeymap {
	const out: CompiledKeymap = { insert: [], normal: [] };
	for (const id of ACTION_IDS) {
		if (!actionScopes(id).some((s) => scopes.includes(s))) continue;
		for (const mode of ["insert", "normal"] as Mode[]) {
			for (const n of keymap[id]?.[mode] ?? []) {
				const seq = parseSequence(n);
				if (seq) out[mode].push({ seq, action: id });
			}
		}
	}
	return out;
}

export interface ResolveResult {
	/** Matched action, if any. */
	action: ActionId | null;
	/** Pending prefix strokes waiting for more input. */
	pending: string[];
	/** True when the stroke was consumed (as an action or as a prefix). */
	consumed: boolean;
}

function seqEq(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((x, i) => x === b[i]);
}
function isPrefix(prefix: string[], seq: string[]): boolean {
	return prefix.length < seq.length && prefix.every((x, i) => x === seq[i]);
}

export function resolve(compiled: CompiledKeymap, mode: Mode, pending: string[], stroke: string): ResolveResult {
	const bindings = compiled[mode];
	const tryWith = (seq: string[]): ResolveResult | null => {
		const exact = bindings.find((b) => seqEq(b.seq, seq));
		if (exact) return { action: exact.action, pending: [], consumed: true };
		if (bindings.some((b) => isPrefix(seq, b.seq))) return { action: null, pending: seq, consumed: true };
		return null;
	};
	if (pending.length > 0) {
		const r = tryWith([...pending, stroke]);
		if (r) return r;
	}
	return tryWith([stroke]) ?? { action: null, pending: [], consumed: false };
}

/** Actions bound to an exact sequence, in compile order (used to try fallbacks like <BS>). */
export function actionsFor(compiled: CompiledKeymap, mode: Mode, seq: string[]): ActionId[] {
	return compiled[mode].filter((b) => seqEq(b.seq, seq)).map((b) => b.action);
}

// ---------------------------------------------------------------------------
// Validation / settings helpers

export interface Conflict {
	mode: Mode;
	kind: "duplicate" | "prefix";
	keys: string;
	actions: ActionId[];
}

function scopesOverlap(a: ActionId, b: ActionId): boolean {
	const sa = actionScopes(a);
	const sb = actionScopes(b);
	return sa.includes("common") || sb.includes("common") || sa.some((s) => sb.includes(s));
}

/** Find duplicate bindings and prefix conflicts between actions that can be active together. */
export function findConflicts(keymap: Keymap): Conflict[] {
	const conflicts: Conflict[] = [];
	for (const mode of ["insert", "normal"] as Mode[]) {
		const entries: { seq: string[]; action: ActionId }[] = [];
		for (const id of ACTION_IDS) {
			for (const n of keymap[id]?.[mode] ?? []) {
				const seq = parseSequence(n);
				if (seq) entries.push({ seq, action: id });
			}
		}
		for (let i = 0; i < entries.length; i++) {
			for (let j = i + 1; j < entries.length; j++) {
				const a = entries[i];
				const b = entries[j];
				if (a.action === b.action) continue;
				if (!scopesOverlap(a.action, b.action)) continue;
				if (seqEq(a.seq, b.seq)) {
					conflicts.push({ mode, kind: "duplicate", keys: a.seq.join(""), actions: [a.action, b.action] });
				} else if (isPrefix(a.seq, b.seq) || isPrefix(b.seq, a.seq)) {
					const [short, long] = a.seq.length < b.seq.length ? [a, b] : [b, a];
					conflicts.push({
						mode,
						kind: "prefix",
						keys: `${short.seq.join("")} / ${long.seq.join("")}`,
						actions: [short.action, long.action],
					});
				}
			}
		}
	}
	return conflicts;
}

function isStringArray(v: unknown): v is string[] {
	return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** Merge saved (possibly partial / stale) keymap data with defaults. */
export function mergeKeymap(saved: unknown): Keymap {
	const out = {} as Keymap;
	const obj = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>;
	for (const id of ACTION_IDS) {
		const def = DEFAULT_KEYMAP[id];
		const s = obj[id] as Partial<Binding> | undefined;
		out[id] = {
			insert: isStringArray(s?.insert) ? [...s.insert] : [...def.insert],
			normal: isStringArray(s?.normal) ? [...s.normal] : [...def.normal],
		};
	}
	return out;
}
