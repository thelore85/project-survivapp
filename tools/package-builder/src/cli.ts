import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPackage } from './build';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

/**
 * Costruisce il pacchetto demo (modelli finti) e lo copia dove l'app web lo può scaricare.
 * Uso: npm run build:package -- [--id demo] [--version 0.1.0] [--out dist/packages/demo]
 */
async function main(): Promise<void> {
  const outDir = path.resolve(root, argument('out', 'dist/packages/demo'));
  const { manifest, warnings } = await buildPackage({
    knowledgeBaseDir: path.join(root, 'knowledge_base'),
    catalogueDir: path.join(root, 'data/catalogue'),
    outDir,
    packageId: argument('id', 'demo'),
    version: argument('version', '0.1.0'),
    cacheDir: path.join(root, 'dist/.cache/text'),
    log: (message) => console.log(message),
  });

  const webDir = path.join(root, 'apps/mobile/public/demo-package');
  await rm(webDir, { recursive: true, force: true });
  await mkdir(path.dirname(webDir), { recursive: true });
  await cp(outDir, webDir, { recursive: true });

  const size = (await stat(path.join(outDir, 'content.db'))).size;
  console.log(`\npacchetto ${manifest.id} ${manifest.version} in ${outDir}`);
  console.log(`  specie: ${manifest.stats.species}, documenti: ${manifest.stats.documents}, passaggi: ${manifest.stats.chunks}`);
  console.log(`  content.db: ${(size / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  copiato in ${webDir}`);
  if (warnings.length > 0) {
    console.log(`\navvisi (${warnings.length}):`);
    for (const warning of warnings) console.log(`  - ${warning}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
