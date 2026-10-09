// Pure text-search helpers. Must not import from "obsidian" so it can be unit-tested.

export type Range = [number, number];

export interface GrepHit {
	/** 0-based line number. */
	line: number;
	/** 0-based column of the first match. */
	col: number;
	/** The whole line. */
	text: string;
	/** Matched [start, end) ranges within `text`. */
	ranges: Range[];
}

export type Matcher = { re: RegExp } | { error: string };

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Smart case: case-insensitive unless the query contains an uppercase letter. */
export function isCaseSensitive(query: string): boolean {
	return query !== query.toLowerCase();
}

/** Build a global RegExp for `query`, taken literally unless `regex` is set. */
export function buildMatcher(query: string, regex: boolean): Matcher {
	const flags = isCaseSensitive(query) ? "g" : "gi";
	try {
		return { re: new RegExp(regex ? query : escapeRegExp(query), flags) };
	} catch (e) {
		return { error: e instanceof Error ? e.message : String(e) };
	}
}

/** All matched ranges of `re` (global) in `line`. Zero-length matches are skipped. */
export function matchLine(line: string, re: RegExp): Range[] {
	const ranges: Range[] = [];
	re.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(line)) !== null) {
		if (m[0].length === 0) {
			re.lastIndex++; // avoid looping forever on patterns like "a*"
			if (re.lastIndex > line.length) break;
			continue;
		}
		ranges.push([m.index, m.index + m[0].length]);
	}
	return ranges;
}

/** Search `text` line by line; at most `limit` hits (one per matching line). */
export function searchText(text: string, re: RegExp, limit = Infinity): GrepHit[] {
	const hits: GrepHit[] = [];
	if (limit <= 0) return hits;
	const lines = text.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].endsWith("\r") ? lines[i].slice(0, -1) : lines[i];
		const ranges = matchLine(line, re);
		if (ranges.length === 0) continue;
		hits.push({ line: i, col: ranges[0][0], text: line, ranges });
		if (hits.length >= limit) break;
	}
	return hits;
}

/**
 * Shorten a line for display: drop leading whitespace and, when still longer than `width`,
 * keep a window around the first match with "…" markers. Ranges are remapped to the result.
 */
export function clipLine(text: string, ranges: Range[], width: number, before = 20): { text: string; ranges: Range[] } {
	const indent = text.length - text.trimStart().length;
	let start = Math.min(indent, ranges[0]?.[0] ?? indent);
	let end = text.length;
	if (end - start > width) {
		const [first, firstEnd] = ranges[0] ?? [start, start];
		// show `before` chars of context, but never push the first match out of the window
		start = Math.max(start, Math.min(first, Math.max(first - before, firstEnd - width)));
		end = Math.min(text.length, start + width);
		if (end === text.length) start = Math.max(0, end - width);
	}
	const head = start > indent ? "…" : "";
	const tail = end < text.length ? "…" : "";
	const shift = head.length - start;
	const out: Range[] = [];
	for (const [s, e] of ranges) {
		const cs = Math.max(s, start);
		const ce = Math.min(e, end);
		if (ce > cs) out.push([cs + shift, ce + shift]);
	}
	return { text: head + text.slice(start, end) + tail, ranges: out };
}
