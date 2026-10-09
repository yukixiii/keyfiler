import { describe, expect, it } from "vitest";
import { buildMatcher, clipLine, matchLine, searchText } from "../src/grep/match";

const re = (q: string, regex = false): RegExp => {
	const m = buildMatcher(q, regex);
	if ("error" in m) throw new Error(m.error);
	return m.re;
};

describe("buildMatcher", () => {
	it("uses smart case", () => {
		expect(matchLine("Foo foo FOO", re("foo"))).toEqual([[0, 3], [4, 7], [8, 11]]);
		expect(matchLine("Foo foo FOO", re("Foo"))).toEqual([[0, 3]]);
	});

	it("escapes literal queries", () => {
		expect(matchLine("a.b axb (x)", re("a.b"))).toEqual([[0, 3]]);
		expect(matchLine("a.b (x) [y]", re("(x)"))).toEqual([[4, 7]]);
	});

	it("supports regex mode and reports invalid patterns", () => {
		expect(matchLine("a.b axb", re("a.b", true))).toEqual([[0, 3], [4, 7]]);
		expect(buildMatcher("(", true)).toHaveProperty("error");
		expect(buildMatcher("(", false)).toHaveProperty("re");
	});
});

describe("matchLine / searchText", () => {
	it("skips zero-length matches without looping", () => {
		expect(matchLine("baab", re("a*", true))).toEqual([[1, 3]]);
		expect(matchLine("", re("^", true))).toEqual([]);
	});

	it("returns one hit per line with all ranges", () => {
		const hits = searchText("日本語のノート\nnothing\r\n日本と日本\n", re("日本"));
		expect(hits).toEqual([
			{ line: 0, col: 0, text: "日本語のノート", ranges: [[0, 2]] },
			{ line: 2, col: 0, text: "日本と日本", ranges: [[0, 2], [3, 5]] },
		]);
	});

	it("respects the limit", () => {
		expect(searchText("x\nx\nx", re("x"), 2)).toHaveLength(2);
		expect(searchText("x", re("x"), 0)).toEqual([]);
	});
});

describe("clipLine", () => {
	it("drops indentation", () => {
		expect(clipLine("    foo bar", [[8, 11]], 80)).toEqual({ text: "foo bar", ranges: [[4, 7]] });
	});

	it("keeps short lines as is", () => {
		expect(clipLine("foo bar", [[4, 7]], 80)).toEqual({ text: "foo bar", ranges: [[4, 7]] });
	});

	it("windows long lines around the first match", () => {
		const line = `${"a".repeat(100)}MATCH${"b".repeat(100)}`;
		const r = clipLine(line, [[100, 105]], 40, 10);
		expect(r.text).toBe(`…${"a".repeat(10)}MATCH${"b".repeat(25)}…`);
		expect(r.ranges).toEqual([[11, 16]]);
		expect(r.text.slice(11, 16)).toBe("MATCH");
	});

	it("aligns the window to the end of the line", () => {
		const line = `${"a".repeat(100)}END`;
		const r = clipLine(line, [[100, 103]], 20, 30);
		expect(r.text).toBe(`…${"a".repeat(17)}END`);
		expect(r.text.slice(r.ranges[0][0], r.ranges[0][1])).toBe("END");
	});
});
