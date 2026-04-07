# DeepOverlay

**DOM-anchored sticky notes for the web** — notes stay tied to the page elements they annotate, scale with responsive layouts, and stay organized in a searchable dashboard. Built as a Manifest V3 Chrome extension with a privacy-first, local-first data model.

Useful for research, translation workflows, and annotating complex UIs where absolute positioning would break.

---

## Why this exists

Traditional overlays pin notes to screen coordinates. DeepOverlay anchors each note to the underlying DOM node and tracks size ratios so notes remain meaningful when the page reflows or the viewport changes.

---

## Highlights

| Area | What it does |
| :--- | :--- |
| **Anchoring** | Notes attach to elements under the cursor, not raw `(x, y)` positions. |
| **Responsive behavior** | Relative scaling when containers resize (e.g. images, flex layouts). |
| **Modes** | Edit mode isolates interaction; view mode is non-interactive; input guard keeps site shortcuts from firing while typing. |
| **Dashboard** | Search, bulk actions, domain grouping, storage usage visibility. |
| **Data** | Primary storage is `chrome.storage.local` on the user’s machine. |

---

## Tech stack

| Layer | Details |
| :--- | :--- |
| **Extension** | Manifest V3, service worker, content scripts, vanilla JS, dynamic CSS. |
| **Layout** | `requestAnimationFrame`, `getBoundingClientRect` for layout-independent updates. |
| **Build** | Vite + `@crxjs/vite-plugin` for options UI; scripts assemble the loadable extension. |

---

## Privacy and networking

- **Notes and metadata** are stored locally via the browser; there is no account system in-tree.

---

## Development

**Requirements:** Node.js 18+ recommended.

```bash
npm install
npm run build:all
```

Load the extension folder in `chrome://extensions` (Developer mode → Load unpacked).

| Script | Purpose |
| :--- | :--- |
| `npm run build:options` | Vite build + copy UI assets. |
| `npm run build:all` | Full build. |
| `npm run build:adapters` | Build content-script adapter bundle (`adapters.js`). |

---

## Keyboard shortcut

| Action | Default |
| :--- | :--- |
| Toggle overlay visibility | **Alt + Shift + O** |

---

## License

MIT — see [LICENSE](LICENSE).
