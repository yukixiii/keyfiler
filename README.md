# Keyfiler

Keyboard-driven fuzzy file finder and file browser for Obsidian, with a telescope.nvim-like feel:
vim-style Insert / Normal modes, a live preview, multi-select, and file operations — all without the mouse.

## Commands

Assign hotkeys in **Settings → Hotkeys** (none are set by default).

| Command | Description |
|---|---|
| `Keyfiler: Find files` | Fuzzy-find any file in the vault (md, images, PDF, canvas, …). Recent files come first. |
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

Marks survive folder changes: mark files, navigate to the destination, press `m`.

### Find files

| Insert | Normal | Action |
|---|---|---|
| `<A-b>` | `b` | Open the file browser at the selected file's folder |

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
npm test        # unit tests (keymap / path helpers)
```

Copy or symlink `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/keyfiler/`.
