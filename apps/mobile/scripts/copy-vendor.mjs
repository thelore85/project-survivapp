// Copia in public/vendor le librerie che il browser carica a runtime (SQLite WebAssembly e pdf.js):
// usano import.meta e file .wasm, quindi restano fuori dal bundle di Metro.
import { cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const vendor = path.resolve(here, '../public/vendor');

const sqlite = path.dirname(require.resolve('@sqlite.org/sqlite-wasm/package.json'));
const pdfjs = path.dirname(require.resolve('pdfjs-dist/package.json'));

await mkdir(path.join(vendor, 'sqlite'), { recursive: true });
await mkdir(path.join(vendor, 'pdfjs'), { recursive: true });
await cp(path.join(sqlite, 'dist/index.mjs'), path.join(vendor, 'sqlite/index.mjs'));
await cp(path.join(sqlite, 'dist/sqlite3.wasm'), path.join(vendor, 'sqlite/sqlite3.wasm'));
await cp(path.join(pdfjs, 'build/pdf.min.mjs'), path.join(vendor, 'pdfjs/pdf.min.mjs'));
await cp(path.join(pdfjs, 'build/pdf.worker.min.mjs'), path.join(vendor, 'pdfjs/pdf.worker.min.mjs'));
console.log(`librerie copiate in ${vendor}`);
