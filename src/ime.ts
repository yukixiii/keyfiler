import { Platform } from "obsidian";

let warned = false;

/** Command that turns the IME off on this platform, like vim's im-select ("" = none known). */
export function defaultImeOffCommand(): string {
	return Platform.isLinux ? "fcitx5-remote -c" : "";
}

/** Run `command` to switch the IME off. Desktop only; failures are logged once and otherwise ignored. */
export function turnImeOff(command: string): void {
	if (!Platform.isDesktopApp || command.trim() === "") return;
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { exec } = require("child_process") as typeof import("child_process");
	exec(command, { timeout: 2000 }, (err) => {
		if (err && !warned) {
			warned = true;
			console.warn(`Keyfiler: IME off command failed: ${command}`, err);
		}
	});
}
