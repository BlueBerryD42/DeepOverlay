/**
 * Flattens Vite dist output into the extension root (Chrome loads options.html, etc. from repo root).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn('Missing (skipped):', path.relative(root, src));
    return;
  }
  fs.copyFileSync(src, dest);
  console.log('Copied', path.relative(root, dest));
}

function flattenHtml(relDistPath, outBasename) {
  const htmlPath = path.join(dist, relDistPath);
  if (!fs.existsSync(htmlPath)) {
    console.error('Missing HTML:', htmlPath);
    process.exit(1);
  }
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace(/\.\.\/\.\.\//g, '');
  const out = path.join(root, outBasename);
  fs.writeFileSync(out, html);
  console.log('Wrote', outBasename);
}

copyIfExists(path.join(dist, 'options.js'), path.join(root, 'options.js'));
copyIfExists(path.join(dist, 'options.css'), path.join(root, 'options.css'));

for (const f of fs.readdirSync(dist)) {
  if (f.startsWith('vite-chunk-') && f.endsWith('.js')) {
    copyIfExists(path.join(dist, f), path.join(root, f));
  }
}

flattenHtml('src/options/options.html', 'options.html');

const likeDest = path.join(root, 'data', 'like.js');
const likeSources = [
  path.join(root, 'data', 'like.js'),
  path.join(root, 'src', 'data', 'like.js'),
];
let likeCopied = false;
for (const src of likeSources) {
  if (!fs.existsSync(src)) continue;
  if (path.resolve(src) === path.resolve(likeDest)) {
    likeCopied = true;
    break;
  }
  fs.mkdirSync(path.dirname(likeDest), { recursive: true });
  fs.copyFileSync(src, likeDest);
  console.log('Copied', path.relative(root, src), '→ data/like.js');
  likeCopied = true;
  break;
}
if (!likeCopied && !fs.existsSync(likeDest)) {
  console.warn('Missing data/like.js — add your X archive like.js to data/like.js');
} else if (fs.existsSync(likeDest)) {
  console.log('data/like.js present');
}
