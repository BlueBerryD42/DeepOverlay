# File Structure Explanation

## Which Files Are Used?

**Chrome Extension uses (from root directory):**
- `options.html` - **This is what Chrome loads** (pointed to by manifest.json)
- `options.js` - **This is what Chrome executes**
- `options.css` - **This is what Chrome styles with**

**You edit (source files in src/options/):**
- `src/options/options.html` - Source HTML (edit this)
- `src/options/options.js` - Source JavaScript (edit this)
- `src/options/options.css` - Source CSS (edit this)
- `src/options/components/` - Component files (edit these)
- `src/options/utils/` - Utility files (edit these)

## Build Process

1. **Edit** files in `src/options/`
2. **Run** `npm run build:options` 
3. **Vite generates** `options.html`, `options.js`, `options.css` in root
4. **Chrome loads** the root files

## Important Notes

- **Never edit** `options.html`, `options.js`, `options.css` in root directly - they get overwritten by build
- **Always edit** files in `src/options/` instead
- After editing, **always run** `npm run build:options`
- After building, **reload extension** in Chrome

## How to Check Storage

After reloading extension, open options page and in browser console (F12), run:

```javascript
inspectStorage()
```

Or directly:
```javascript
chrome.storage.local.get(null, console.log)
```


