/** Append `text` to `el`, wrapping matched ranges (relative to `offset`) in highlight spans. */
export function renderHighlighted(el: HTMLElement, text: string, matches: [number, number][], offset = 0): void {
	let pos = 0;
	for (const [s0, e0] of matches) {
		const s = Math.max(0, s0 - offset);
		const e = Math.min(text.length, e0 - offset);
		if (e <= s || s < pos) continue;
		el.appendText(text.slice(pos, s));
		el.createSpan({ cls: "keyfiler-match", text: text.slice(s, e) });
		pos = e;
	}
	el.appendText(text.slice(pos));
}
