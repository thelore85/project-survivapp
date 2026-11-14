// Valida data/catalogue/species.json. Uso: node tools/catalogue/validate-catalogue.mjs
// Esce con codice 1 se trova errori.
import { readFileSync, existsSync, openSync, readSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'catalogue');
const LANGS = ['en', 'it', 'es'];
const KINDS = ['plant', 'fungus'];
const LEVELS = ['deadly', 'toxic', 'caution', 'none_recorded'];
const PHOTO_LICENSES = ['cc0', 'cc-by', 'cc-by-sa'];
const FEATURE_KEYS = ['capShape', 'hymeniumType', 'gillAttachment', 'stipeCharacter', 'sporePrintColor', 'ecologicalType'];
const TAXONOMY_KEYS = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus'];
// Valori ammessi dal parametro `howEdible` del mycomorphbox: non devono mai comparire tra le features.
const HOW_EDIBLE = ['choice', 'edible', 'inedible', 'unpalatable', 'poisonous', 'deadly', 'psychoactive', 'allergenic', 'caution', 'unknown', 'not recommended', 'too hard to eat'];
// Una nota di tossicità descrive un pericolo: non può dichiarare la specie commestibile o sicura.
const SAFE_CLAIM = /\b(edible|safe to eat|is safe|commestibil\w*|edul[ei]|sicur[oa] da mangiare|comestibles?|segur[oa] para comer)\b/i;

const errors = [];
const err = (id, msg) => errors.push(`${id}: ${msg}`);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function jpegHead(file) {
  const fd = openSync(file, 'r');
  const buf = Buffer.alloc(2);
  readSync(fd, buf, 0, 2, 0);
  closeSync(fd);
  return buf[0] === 0xff && buf[1] === 0xd8;
}

const records = JSON.parse(readFileSync(join(DATA, 'species.json'), 'utf8'));
const list = JSON.parse(readFileSync(join(DATA, 'species-list.json'), 'utf8'));
if (!Array.isArray(records)) throw new Error('species.json non è un array');
if (records.length !== list.length) err('*', `record ${records.length} != specie in lista ${list.length}`);

const ids = new Set();
for (const r of records) {
  const id = r?.id ?? '(senza id)';
  if (!isStr(r.id)) err(id, 'id mancante');
  if (ids.has(r.id)) err(id, 'id duplicato');
  ids.add(r.id);
  if (!isStr(r.scientificName)) err(id, 'scientificName mancante');
  else if (r.id !== r.scientificName.toLowerCase().replace(/\s+/g, '-')) err(id, 'id non coerente con scientificName');
  if (!KINDS.includes(r.kind)) err(id, `kind non valido: ${r.kind}`);

  if (!isObj(r.taxonomy)) err(id, 'taxonomy non è un oggetto');
  else for (const [k, v] of Object.entries(r.taxonomy)) if (!TAXONOMY_KEYS.includes(k) || !isStr(v)) err(id, `taxonomy.${k} non valido`);
  if (r.gbifKey !== null && !Number.isInteger(r.gbifKey)) err(id, 'gbifKey non è intero né null');

  for (const field of ['commonNames', 'descriptions']) if (!isObj(r[field])) err(id, `${field} non è un oggetto`);
  for (const lang of LANGS) {
    const names = r.commonNames?.[lang];
    if (!Array.isArray(names) || names.some((n) => !isStr(n))) err(id, `commonNames.${lang} non è un array di stringhe`);
    else {
      if (names.length > 5) err(id, `commonNames.${lang} ha più di 5 nomi`);
      if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) err(id, `commonNames.${lang} ha duplicati`);
    }
    const d = r.descriptions?.[lang];
    if (d !== undefined && !isStr(d)) err(id, `descriptions.${lang} non è una stringa`);
  }
  for (const k of Object.keys(r.descriptions ?? {})) if (!LANGS.includes(k)) err(id, `descriptions.${k}: lingua non prevista`);

  if (!isObj(r.features)) err(id, 'features non è un oggetto');
  else {
    if (r.kind === 'plant' && Object.keys(r.features).length) err(id, 'features valorizzato su una pianta');
    for (const [k, v] of Object.entries(r.features)) {
      if (!FEATURE_KEYS.includes(k)) err(id, `features.${k}: chiave non ammessa`);
      if (!isStr(v)) err(id, `features.${k} non è una stringa`);
      else if (v.split(',').some((part) => HOW_EDIBLE.includes(part.trim().toLowerCase()))) err(id, `features.${k} contiene un valore di commestibilità: ${v}`);
    }
  }

  const tox = r.toxicity;
  if (!isObj(tox) || !LEVELS.includes(tox.level)) err(id, 'toxicity.level non valido');
  else if (tox.level === 'none_recorded') {
    if (tox.note !== null) err(id, 'none_recorded deve avere note null');
  } else if (!isObj(tox.note) || LANGS.some((l) => !isStr(tox.note[l]))) err(id, 'toxicity.note incompleta');
  else for (const l of LANGS) if (SAFE_CLAIM.test(tox.note[l])) err(id, `toxicity.note.${l} dichiara commestibilità/sicurezza`);

  if (!Array.isArray(r.lookalikes) || r.lookalikes.some((l) => !isStr(l))) err(id, 'lookalikes non è un array di stringhe');
  if (!Array.isArray(r.sources)) err(id, 'sources non è un array');
  else for (const s of r.sources) if (!isStr(s?.name) || !/^https:\/\//.test(s?.url ?? '') || !isStr(s?.license)) err(id, `source non valida: ${JSON.stringify(s)}`);

  if (!Array.isArray(r.images)) err(id, 'images non è un array');
  else for (const img of r.images) {
    if (!isStr(img?.file) || !isStr(img?.sourceUrl) || typeof img?.attribution !== 'string') { err(id, 'image incompleta'); continue; }
    if (!PHOTO_LICENSES.includes(img.license)) err(id, `licenza foto non ammessa: ${img.license}`);
    if (img.file !== `images/${r.id}.jpg`) err(id, `nome file foto inatteso: ${img.file}`);
    const file = join(DATA, img.file);
    if (!existsSync(file)) err(id, `file foto mancante: ${img.file}`);
    else if (!jpegHead(file)) err(id, `il file non è un JPEG: ${img.file}`);
  }

  // Nessuna traccia del campo di commestibilità del mycomorphbox in tutto il record.
  if (/how\s*edible/i.test(JSON.stringify(r))) err(id, 'il record contiene "howEdible"');
}

for (const r of records) {
  for (const l of r.lookalikes ?? []) {
    if (!ids.has(l)) err(r.id, `lookalike inesistente: ${l}`);
    if (l === r.id) err(r.id, 'lookalike su se stesso');
  }
}
const byId = new Map(records.map((r) => [r.id, r]));
for (const sp of list) {
  const r = byId.get(sp.scientificName.toLowerCase().replace(/\s+/g, '-'));
  if (!r) { err(sp.scientificName, 'presente in lista ma non in species.json'); continue; }
  if (r.toxicity?.level !== sp.toxicity.level) err(r.id, 'toxicity.level diverso dalla lista');
}

const count = (fn) => records.filter(fn).length;
const tally = (fn) => records.reduce((acc, r) => { const k = fn(r); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
console.log(JSON.stringify({
  species: records.length,
  byKind: tally((r) => r.kind),
  byToxicity: tally((r) => r.toxicity.level),
  withPhoto: count((r) => r.images.length > 0),
  withGbif: count((r) => r.gbifKey !== null),
  withDescription: Object.fromEntries(LANGS.map((l) => [l, count((r) => isStr(r.descriptions[l]))])),
  withCommonNames: Object.fromEntries(LANGS.map((l) => [l, count((r) => r.commonNames[l].length > 0)])),
  fungiWithFeatures: count((r) => r.kind === 'fungus' && Object.keys(r.features).length > 0),
  asymmetricLookalikes: records.flatMap((r) => r.lookalikes.filter((l) => !byId.get(l)?.lookalikes.includes(r.id)).map((l) => `${r.id} -> ${l}`)).length,
}, null, 2));

if (errors.length) {
  console.error(`\n${errors.length} errori:`);
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log('OK: nessun errore');
