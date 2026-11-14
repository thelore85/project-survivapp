// Smoke test dell'app nel browser, in modalità demo.
// Richiede il server di sviluppo avviato (npm run web) e un browser Chromium installato (Edge o Chrome).
// Uso: node e2e/smoke.mjs [url] — default http://localhost:8081
import { mkdir, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:8081';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = path.join(root, 'dist/smoke');
await mkdir(outDir, { recursive: true });

const results = [];
const problems = [];

async function step(name, fn) {
  try {
    await fn();
    results.push(`ok    ${name}`);
  } catch (error) {
    results.push(`FAIL  ${name}: ${String(error.message).split('\n')[0]}`);
    process.exitCode = 1;
  }
}

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      // prova il canale successivo
    }
  }
  throw new Error('nessun browser Chromium trovato (Edge o Chrome)');
}

const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'it-IT' });
const page = await context.newPage();
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(`console: ${message.text()}`);
});

const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
const input = () => page.getByRole('textbox').first();
const send = async (text) => {
  await input().fill(text);
  await page.getByRole('button', { name: /^(Invia|Send|Enviar)$/ }).click();
};

await step('avvio: la chat si apre con il pacchetto demo', async () => {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.getByText('Da dove partiamo?').waitFor({ timeout: 180_000 });
  await page.getByText('Modalità demo').first().waitFor();
  await shot('01-avvio');
});

await step('survival: risposta con fonti, pagina e avviso', async () => {
  await send('Come purifico l’acqua di un torrente?');
  await page.getByText('Fonti', { exact: true }).waitFor({ timeout: 60_000 });
  await page.getByText(/FM 3-05\.70 Survival · p\. \d+/).first().waitFor();
  await page.getByText(/potabilità dell.acqua dipende/).waitFor();
  await page.getByText('Mostra il passaggio').first().click();
  await page.getByText('Nascondi il passaggio').first().waitFor();
  await shot('02-survival');
});

await step('survival: fonti insufficienti dichiarate', async () => {
  await send('cosa dice il manuale sul carburatore dei tosaerba?');
  await page.getByText(/Non invento una procedura/).waitFor({ timeout: 60_000 });
});

await step('survival: un seguito breve eredita l’argomento della domanda precedente', async () => {
  await page.getByRole('button', { name: 'Nuova chat' }).click();
  await send('Come costruire un riparo per la notte?');
  await page.getByText('Fonti', { exact: true }).waitFor({ timeout: 60_000 });
  await send('che materiali usare?');
  await page.getByText('Fonti', { exact: true }).nth(1).waitFor({ timeout: 60_000 });
});

await step('orchestratore: richiesta ambigua → chiarimento con opzioni', async () => {
  await page.getByRole('button', { name: 'Nuova chat' }).click();
  await send('dimmi qualcosa di interessante');
  await page.getByText(/Non ho capito a quale ambito/).waitFor({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Manuali di sopravvivenza' }).waitFor();
});

const imagesDir = path.join(root, 'data/catalogue/images');
let sampleImage = null;
try {
  const first = readdirSync(imagesDir).find((file) => file.endsWith('.jpg'));
  if (first) sampleImage = path.join(imagesDir, first);
} catch {
  // nessuna immagine di catalogo: il passo botanico viene saltato
}

if (sampleImage) {
  await step('botanica: una foto produce candidati con avvisi, senza percentuali', async () => {
    await page.getByRole('button', { name: 'Nuova chat' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Galleria' }).click();
    await (await chooser).setFiles(sampleImage);
    await page.getByRole('button', { name: 'Togli la foto' }).waitFor({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Invia' }).click();
    await page.getByText('Specie candidate', { exact: true }).waitFor({ timeout: 90_000 });
    await page.getByText(/non è mai certa/).waitFor();
    await page.getByText(/Non usare questa app per decidere se mangiare/).first().waitFor();
    const text = await page.locator('body').innerText();
    if (/\d\s?%/.test(text)) throw new Error('trovata una percentuale nella risposta botanica');
    await shot('03-botanica');
    await page.getByRole('button', { name: 'Apri la scheda' }).first().click();
    await page.getByText('Fonti e licenze').waitFor();
    await shot('04-scheda');
    // La scheda si chiude anche con un clic fuori, sullo sfondo scuro.
    await page.mouse.click(12, 12);
    await page.getByText('Fonti e licenze').waitFor({ state: 'hidden' });
  });
} else {
  results.push('skip  botanica: nessuna immagine in data/catalogue/images');
}

await step('libreria: importa un file di testo e rifiuta un formato non ammesso', async () => {
  await page.getByRole('tab', { name: 'Libreria' }).click();
  await page.getByText('Pacchetto base').waitFor();
  const note = path.join(outDir, 'appunti-bivacco.txt');
  await writeFile(note, 'BIVACCO\n\nPer un bivacco invernale scava una truna nella neve e isola il fondo con rami di abete. '.repeat(4));
  let chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importa un file' }).click();
  await (await chooser).setFiles(note);
  await page.getByText(/Importato: \d+ pagine/).waitFor({ timeout: 60_000 });
  await page.getByText('appunti-bivacco', { exact: true }).waitFor();

  const wrong = path.join(outDir, 'non-ammesso.exe');
  await writeFile(wrong, 'x');
  chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importa un file' }).click();
  await (await chooser).setFiles(wrong);
  await page.getByText(/Formato non ammesso/).waitFor({ timeout: 30_000 });
  await shot('05-libreria');
});

await step('survival: il file dell’utente diventa una fonte', async () => {
  await page.getByRole('tab', { name: 'Chat' }).click();
  await page.getByRole('button', { name: 'Nuova chat' }).click();
  await send('come preparo un bivacco nella neve?');
  await page.getByText(/appunti-bivacco/).first().waitFor({ timeout: 60_000 });
});

await step('impostazioni: il tema si cambia a mano', async () => {
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  const isDark = () => page.evaluate(() => document.documentElement.classList.contains('dark'));
  await page.getByRole('button', { name: 'Scuro' }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  await shot('06a-tema-scuro');
  await page.getByRole('button', { name: 'Chiaro' }).click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('dark'));
  if (await isDark()) throw new Error('il tema chiaro non è stato applicato');
  await shot('06b-tema-chiaro');
});

await step('impostazioni: lingua e quota cambiano e restano dopo il ricaricamento', async () => {
  await page.getByRole('tab', { name: 'Impostazioni' }).click();
  await page.getByText('200 MB', { exact: true }).waitFor();
  await page.getByRole('button', { name: '+ 50 MB' }).click();
  await page.getByText('250 MB', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'English' }).click();
  await page.getByText('Space for your files').waitFor();
  await shot('06-impostazioni');
  await page.waitForTimeout(1200); // il salvataggio su IndexedDB è differito
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Where do we start?').waitFor({ timeout: 120_000 });
  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByText('250 MB', { exact: true }).waitFor();
});

await step('cronologia: le conversazioni restano dopo il ricaricamento e si riaprono', async () => {
  const item = page.getByRole('button', { name: /bivacco nella neve/ }).first();
  await item.waitFor();
  await item.click();
  await page.getByText(/appunti-bivacco/).first().waitFor();
});

await step('schermo stretto: barra in basso e chat utilizzabile', async () => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByRole('tab', { name: 'History' }).waitFor();
  await page.getByRole('tab', { name: 'Chat' }).click();
  await shot('07-telefono');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) throw new Error('la pagina scorre in orizzontale');
});

await browser.close();

console.log(results.join('\n'));
if (problems.length > 0) {
  console.log(`\nerrori nella console del browser (${problems.length}):`);
  for (const problem of [...new Set(problems)].slice(0, 15)) console.log(`  - ${problem}`);
  process.exitCode = 1;
}
console.log(`\nschermate in ${outDir}`);
