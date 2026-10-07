import { describe, expect, it } from "vitest";
import {
	DEFAULT_KEYMAP,
	compileKeymap,
	eventToString,
	findConflicts,
	mergeKeymap,
	parseSequence,
	resolve,
	scopesFor,
	splitNotations,
	type Keymap,
} from "../src/ui/keymap";

const ev = (key: string, mods: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {}, code?: string) => ({
	key,
	code,
	ctrlKey: !!mods.ctrl,
	altKey: !!mods.alt,
	shiftKey: !!mods.shift,
	metaKey: !!mods.meta,
});

describe("notation", () => {
	it("parses plain, special and modified keys", () => {
		expect(parseSequence("j")).toEqual(["j"]);
		expect(parseSequence("gg")).toEqual(["g", "g"]);
		expect(parseSequence("G")).toEqual(["G"]);
		expect(parseSequence("<C-n>")).toEqual(["<C-n>"]);
		expect(parseSequence("<c-N>")).toEqual(["<C-n>"]);
		expect(parseSequence("<M-c>")).toEqual(["<A-c>"]);
		expect(parseSequence("<S-Tab>")).toEqual(["<S-Tab>"]);
		expect(parseSequence("<Enter>")).toEqual(["<CR>"]);
		expect(parseSequence("<space>")).toEqual(["<Space>"]);
		expect(parseSequence("<lt>")).toEqual(["<lt>"]);
		expect(parseSequence("<comma>")).toEqual(["<comma>"]);
		expect(parseSequence("<C-S-v>")).toEqual(["<C-S-v>"]);
	});

	it("rejects invalid notation", () => {
		expect(parseSequence("")).toBeNull();
		expect(parseSequence("<C-n")).toBeNull();
		expect(parseSequence("<Foo>")).toBeNull();
		expect(parseSequence("a b")).toBeNull();
	});

	it("normalizes keyboard events to the same canonical form", () => {
		expect(eventToString(ev("j"))).toBe("j");
		expect(eventToString(ev("G", { shift: true }))).toBe("G");
		expect(eventToString(ev("n", { ctrl: true }, "KeyN"))).toBe("<C-n>");
		expect(eventToString(ev("V", { ctrl: true, shift: true }, "KeyV"))).toBe("<C-S-v>");
		expect(eventToString(ev("ç", { alt: true }, "KeyC"))).toBe("<A-c>");
		expect(eventToString(ev("Tab", { shift: true }))).toBe("<S-Tab>");
		expect(eventToString(ev("Escape"))).toBe("<Esc>");
		expect(eventToString(ev(" "))).toBe("<Space>");
		expect(eventToString(ev(","))).toBe("<comma>");
		expect(eventToString(ev("<", { shift: true }))).toBe("<lt>");
		expect(eventToString(ev("あ"))).toBe("あ");
		expect(eventToString(ev("Control", { ctrl: true }))).toBeNull();
		expect(eventToString(ev("Process"))).toBeNull();
		expect(eventToString(ev("F5"))).toBeNull();
	});

	it("round-trips event strings through the parser", () => {
		for (const s of ["j", "G", "<C-n>", "<C-S-v>", "<A-c>", "<S-Tab>", "<Esc>", "<Space>", "<comma>", "<lt>"]) {
			expect(parseSequence(s)).toEqual([s]);
		}
	});

	it("splits settings text", () => {
		expect(splitNotations("<C-n>, <Down> ,j,,")).toEqual(["<C-n>", "<Down>", "j"]);
		expect(splitNotations("  ")).toEqual([]);
	});
});

describe("resolve", () => {
	const browser = compileKeymap(DEFAULT_KEYMAP, scopesFor("browser"));
	const find = compileKeymap(DEFAULT_KEYMAP, scopesFor("find"));

	it("resolves per mode", () => {
		expect(resolve(browser, "normal", [], "j").action).toBe("moveDown");
		expect(resolve(browser, "insert", [], "j")).toEqual({ action: null, pending: [], consumed: false });
		expect(resolve(browser, "insert", [], "<C-n>").action).toBe("moveDown");
		expect(resolve(browser, "insert", [], "<Esc>").action).toBe("toNormal");
		expect(resolve(browser, "normal", [], "<Esc>").action).toBe("close");
	});

	it("handles gg sequences", () => {
		const r1 = resolve(browser, "normal", [], "g");
		expect(r1).toEqual({ action: null, pending: ["g"], consumed: true });
		expect(resolve(browser, "normal", r1.pending, "g").action).toBe("first");
		// broken sequence falls back to the new stroke alone
		expect(resolve(browser, "normal", ["g"], "j")).toEqual({ action: "moveDown", pending: [], consumed: true });
	});

	it("respects picker scopes", () => {
		expect(resolve(browser, "normal", [], "c").action).toBe("create");
		expect(resolve(find, "normal", [], "c").action).toBeNull();
		expect(resolve(find, "normal", [], "b").action).toBe("revealInBrowser");
		expect(resolve(browser, "normal", [], "b").action).toBeNull();
	});

	it("uses user overrides", () => {
		const km: Keymap = mergeKeymap({ moveDown: { insert: ["<C-e>"], normal: ["j"] }, create: { normal: ["n"] } });
		const c = compileKeymap(km, scopesFor("browser"));
		expect(resolve(c, "insert", [], "<C-e>").action).toBe("moveDown");
		expect(resolve(c, "insert", [], "<C-n>").action).toBeNull();
		expect(resolve(c, "normal", [], "n").action).toBe("create");
		expect(resolve(c, "normal", [], "c").action).toBeNull();
	});
});

describe("conflicts and merge", () => {
	it("default keymap has no conflicts", () => {
		expect(findConflicts(DEFAULT_KEYMAP)).toEqual([]);
	});

	it("detects duplicates and prefix conflicts", () => {
		const km = mergeKeymap({ create: { insert: ["<A-c>"], normal: ["j"] }, rename: { insert: ["<A-r>"], normal: ["g"] } });
		const c = findConflicts(km);
		expect(c).toContainEqual({ mode: "normal", kind: "duplicate", keys: "j", actions: ["moveDown", "create"] });
		expect(c).toContainEqual({ mode: "normal", kind: "prefix", keys: "g / gg", actions: ["rename", "first"] });
	});

	it("ignores conflicts between find-only and browser-only actions", () => {
		const km = mergeKeymap({ revealInBrowser: { insert: [], normal: ["c"] } });
		expect(findConflicts(km)).toEqual([]);
	});

	it("merges partial / invalid saved data with defaults", () => {
		const km = mergeKeymap({ moveDown: { insert: ["<C-e>"] }, rename: "bogus", unknownAction: { insert: ["x"] } });
		expect(km.moveDown).toEqual({ insert: ["<C-e>"], normal: DEFAULT_KEYMAP.moveDown.normal });
		expect(km.rename).toEqual(DEFAULT_KEYMAP.rename);
		expect("unknownAction" in km).toBe(false);
		expect(mergeKeymap(undefined)).toEqual(DEFAULT_KEYMAP);
	});
});
