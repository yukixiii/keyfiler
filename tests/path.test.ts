import { describe, expect, it } from "vitest";
import { baseName, isWithin, joinPath, parentPath, parseNewEntry, parseRename, splitExt, uniquePath } from "../src/util/path";

describe("path", () => {
	it("joins and splits", () => {
		expect(joinPath("/", "a.md")).toBe("a.md");
		expect(joinPath("x/y", "a.md")).toBe("x/y/a.md");
		expect(parentPath("x/y/a.md")).toBe("x/y");
		expect(parentPath("a.md")).toBe("/");
		expect(baseName("x/y/a.md")).toBe("a.md");
		expect(splitExt("x/a.b/note.md")).toEqual(["x/a.b/note", ".md"]);
		expect(splitExt("x/a.b/note")).toEqual(["x/a.b/note", ""]);
		expect(splitExt(".hidden")).toEqual([".hidden", ""]);
	});

	it("creates unique paths", () => {
		const taken = new Set(["a.md", "a 1.md", "dir"]);
		expect(uniquePath("b.md", (p) => taken.has(p))).toBe("b.md");
		expect(uniquePath("a.md", (p) => taken.has(p))).toBe("a 2.md");
		expect(uniquePath("dir", (p) => taken.has(p))).toBe("dir 1");
	});

	it("parses create input", () => {
		expect(parseNewEntry("/", "note")).toEqual({ path: "note.md", isFolder: false });
		expect(parseNewEntry("x", "img.png")).toEqual({ path: "x/img.png", isFolder: false });
		expect(parseNewEntry("x", "sub/")).toEqual({ path: "x/sub", isFolder: true });
		expect(parseNewEntry("x", "sub/note")).toEqual({ path: "x/sub/note.md", isFolder: false });
		expect(parseNewEntry("x", "  ")).toBeNull();
		expect(parseNewEntry("x", "../a")).toBeNull();
	});

	it("parses rename input", () => {
		expect(parseRename("x/a.md", "b.md")).toBe("x/b.md");
		expect(parseRename("x/a.md", "sub/b.md")).toBe("x/sub/b.md");
		expect(parseRename("x/a.md", "/top.md")).toBe("top.md");
		expect(parseRename("x/a.md", "")).toBeNull();
		expect(parseRename("x/a.md", "a/../b")).toBeNull();
	});

	it("checks containment", () => {
		expect(isWithin("x/y", "x")).toBe(true);
		expect(isWithin("xy", "x")).toBe(false);
		expect(isWithin("x", "/")).toBe(true);
	});
});
