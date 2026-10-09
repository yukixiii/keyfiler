# Keyfiler

Keyboard-driven fuzzy file finder, live full-text grep and file browser for Obsidian, with a telescope.nvim-like feel:
vim-style Insert / Normal modes, a live preview, multi-select, and file operations — all without the mouse.

## Commands

Assign hotkeys in **Settings → Hotkeys** (none are set by default).

| Command | Description |
|---|---|
| `Keyfiler: Find files` | Fuzzy-find any file in the vault (md, images, PDF, canvas, …). Recent files come first. |
| `Keyfiler: Grep` | Search note contents as you type (like telescope's live_grep); one row per matching line. |
| `Keyfiler: Grep selected text` | Grep for the editor selection (first line), or the word under the cursor. |
| `Keyfiler: File browser (current folder)` | Browse starting from the active file's folder. |
| `Keyfiler: File browser (vault root)` | Browse starting from the vault root. |

## Default keys

All bindings can be changed in **Settings → Keyfiler → Keymap** (vim notation such as `j`, `gg`, `<C-n>`, `<A-c>`, `<S-Tab>`).

### Common

| Insert | Normal | Action |
|---|---|---|
| `<Down>` `<C-n>` `<C-j>` | `j` | Move down |
| `<Up>` `<C-p>` `<C-k>` | `k` | Move up |
| | `<C-d>` / `<C-u>` | Half page down / up |
| | `gg` / `G` | First / last |
| `<CR>` | `<CR>` `l` | Open file / enter folder |
| `<C-v>` / `<C-x>` / `<C-t>` | same, `t` | Open in vertical split / horizontal split / new tab |
| `<Tab>` / `<S-Tab>` | `<Tab>` `<Space>` | Toggle mark |
| | `u` | Clear marks |
| `<C-d>` / `<C-u>` | `<C-f>` / `<C-b>` | Scroll preview |
| `<Esc>` | `i` `a` `/` | Switch mode |
| `<C-c>` | `<Esc>` `q` | Close |

With files marked, the open actions open every marked file.

### File browser

| Insert | Normal | Action |
|---|---|---|
| `<C-h>`, `<BS>` (empty query) | `h` `-` `<BS>` | Parent folder |
| `<A-c>` | `c` | Create (`name/` = folder, no extension = `.md`, `a/b/c` creates folders) |
| `<A-r>` | `r` | Rename (a path like `sub/new.md` moves too) |
| `<A-m>` | `m` | Move marked items into the current folder |
| `<A-y>` | `y` | Copy marked items into the current folder |
| `<A-d>` | `d` | Delete marked items (or the item under the cursor) to trash, after `y/N` |
| `<A-e>` / `<A-w>` | `e` / `w` | Go to vault root / active file's folder |
| `<C-f>` | `f` | Find files under the current folder |
| `<C-g>` | `s` | Grep under the current folder |

Marks survive folder changes: mark files, navigate to the destination, press `m`.

### Find files

| Insert | Normal | Action |
|---|---|---|
| `<A-b>` | `b` | Open the file browser at the selected file's folder |
| `<C-g>` | `s` | Grep in the same folder, keeping the query |

### Grep

| Insert | Normal | Action |
|---|---|---|
| `<C-r>` | `R` | Toggle regular expression mode |
| `<C-f>` | `f` | Find files in the same folder, keeping the query |
| `<A-b>` | `b` | Open the file browser at the selected file's folder |

- Searches Markdown and plain-text files (`txt`, `json`, `canvas`, `csv`, `js`, `css`, `yaml`, …), skipping
  **Excluded files**. Recently opened files come first.
- The query is literal and **smart case**: case-insensitive unless it contains an uppercase letter.
  In regex mode it is a JavaScript regular expression; while it is invalid, the previous results stay and the
  error is shown in the status line.
- Results stream in as files are searched; the search stops at 2000 matching lines.
- Opening a result puts the cursor on the match (`<C-v>` / `<C-x>` / `<C-t>` work too). With files marked,
  each marked file opens at its first match. The preview shows the lines around the match.
- File contents are cached between searches and revalidated by modification time.

## Notes

- While an IME is composing (e.g. Japanese input), keys are never interpreted as commands.
- Like vim's im-select, the IME is switched off when the picker enters Normal mode and whenever a file is opened
  (desktop only). This runs the command in **Settings → Keyfiler → IME off command**: `fcitx5-remote -c` by default
  on Linux; use e.g. `ibus engine xkb:us::eng` for IBus or `im-select com.apple.keylayout.ABC` on macOS.
- While the picker is open, global Obsidian hotkeys are suppressed so `<C-n>`, `<C-p>`, `<C-f>` work as picker keys.
- Rename / move use Obsidian's file manager, so internal links are updated according to
  **Settings → Files and links → Automatically update internal links**.
- If your window manager grabs `Alt`, rebind the Insert-mode `<A-…>` keys or use Normal mode.

## Development

```sh
npm install
npm run dev     # watch build
npm run build   # type-check + production build
npm test        # unit tests (keymap / path / grep helpers)
```

Copy or symlink `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/keyfiler/`.
