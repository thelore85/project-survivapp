// Costruisce data/catalogue/species.json e le foto a partire da species-list.json.
// Uso: node tools/catalogue/build-catalogue.mjs [--only="Amanita phalloides"]
// Riprendibile: ogni risposta API finisce in data/catalogue/.cache/ e non viene richiesta due volte.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = join(ROOT, 'data', 'catalogue');
const CACHE = join(DATA, '.cache');
const IMAGES = join(DATA, 'images');
const UA = 'survivapp-catalogue-builder/0.1';
const LANGS = ['en', 'it', 'es'];
const GBIF_LANG = { eng: 'en', en: 'en', ita: 'it', it: 'it', spa: 'es', es: 'es' };
const PHOTO_LICENSES = { cc0: 'CC0 1.0', 'cc-by': 'CC BY 4.0', 'cc-by-sa': 'CC BY-SA 4.0' };
const MAX_NAMES = 5;
const CONCURRENCY = 4;
// Intervallo minimo tra due richieste allo stesso host (ms): ~3 req/s; iNaturalist e Wikimedia 1 req/s.
// I siti Wikimedia condividono lo stesso limite, quindi anche la stessa coda.
const HOST_INTERVAL = { 'api.inaturalist.org': 1100, wikimedia: 1000, default: 350 };
const hostKey = (host) => (/.(wikipedia|wikidata).org$/.test(host) ? 'wikimedia' : host);
// Parametri del mycomorphbox ammessi. `howEdible` è escluso di proposito: mai copiare la commestibilità.
const MYCO_FIELDS = {
  capshape: 'capShape',
  hymeniumtype: 'hymeniumType',
  whichgills: 'gillAttachment',
  stipecharacter: 'stipeCharacter',
  sporeprintcolor: 'sporePrintColor',
  ecologicaltype: 'ecologicalType',
};

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (name) => name.toLowerCase().trim().replace(/\s+/g, '-');

// --- rete: rate limit per host + retry con backoff -------------------------

const hostQueue = new Map();
/** Accoda la richiesta dietro alle precedenti dello stesso host, rispettando l'intervallo minimo. */
function throttle(host) {
  const gap = HOST_INTERVAL[host] ?? HOST_INTERVAL.default;
  const prev = hostQueue.get(host) ?? Promise.resolve();
  const slot = prev.then(() => sleep(gap));
  hostQueue.set(host, slot);
  return prev;
}

/** fetch con retry su 429/5xx ed errori di rete; ritorna la Response finale (anche 404). */
async function request(url) {
  const host = hostKey(new URL(url).host);
  for (let attempt = 0; ; attempt++) {
    await throttle(host);
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json, image/jpeg, */*' }, redirect: 'follow' });
    } catch (err) {
      if (attempt >= 5) throw err;
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 5) throw new Error(`HTTP ${res.status} dopo ${attempt + 1} tentativi: ${url}`);
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 1500 * 2 ** attempt);
      continue;
    }
    return res;
  }
}

/** GET JSON con cache su disco. Ritorna { status, body }; i 404 vengono messi in cache come tali. */
async function getJson(bucket, url) {
  const file = join(CACHE, bucket, createHash('sha1').update(url).digest('hex') + '.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const res = await request(url);
  let body = null;
  if (res.ok) body = await res.json();
  else await res.arrayBuffer();
  const entry = { url, status: res.status, body };
  if (res.ok || res.status === 404) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(entry));
  }
  return entry;
}

const isJpeg = (file) => {
  if (!existsSync(file) || statSync(file).size < 1000) return false;
  const head = readFileSync(file).subarray(0, 2);
  return head[0] === 0xff && head[1] === 0xd8;
};

// --- GBIF ------------------------------------------------------------------

async function gbifMatch(sp) {
  const kingdom = sp.kind === 'fungus' ? 'Fungi' : 'Plantae';
  const url = `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(sp.scientificName)}&kingdom=${kingdom}`;
  const { body } = await getJson('gbif-match', url);
  if (!body || body.matchType === 'NONE' || !body.usageKey) return null;
  if (!['SPECIES', 'SUBSPECIES', 'VARIETY', 'FORM'].includes(body.rank)) return null;
  const taxonomy = {};
  for (const rank of ['kingdom', 'phylum', 'class', 'order', 'family', 'genus']) if (body[rank]) taxonomy[rank] = body[rank];
  return {
    key: body.acceptedUsageKey ?? body.usageKey,
    matchedKey: body.usageKey,
    status: body.status,
    matchType: body.matchType,
    acceptedName: body.species ?? body.canonicalName,
    taxonomy,
  };
}

const datasetBySource = new Map();
/** Licenza del dataset che ha fornito un nome comune (una risoluzione per titolo di sorgente). */
function vernacularDataset(entry) {
  const source = entry.source ?? '';
  if (!datasetBySource.has(source)) {
    datasetBySource.set(source, (async () => {
      if (!entry.sourceTaxonKey) return null;
      const usage = await getJson('gbif-usage', `https://api.gbif.org/v1/species/${entry.sourceTaxonKey}`);
      const datasetKey = usage.body?.datasetKey;
      if (!datasetKey) return null;
      const ds = await getJson('gbif-dataset', `https://api.gbif.org/v1/dataset/${datasetKey}`);
      if (!ds.body) return null;
      const raw = ds.body.license ?? '';
      let license = null;
      if (/publicdomain\/zero/.test(raw)) license = 'CC0 1.0';
      else if (/licenses\/by\/4\.0/.test(raw)) license = 'CC BY 4.0';
      return { key: datasetKey, title: ds.body.title ?? source, license, rawLicense: raw };
    })().catch(() => null));
  }
  return datasetBySource.get(source);
}

const cleanName = (s) => s.replace(/\s+/g, ' ').trim();
const badName = (name, sci) =>
  !name || name.length > 60 || /[,;()\[\]]/.test(name) || name.toLowerCase() === sci.toLowerCase();

/** Nomi comuni en/it/es da GBIF, solo da dataset CC0 / CC BY, ordinati per frequenza. */
async function gbifVernacular(key, sci) {
  const { body } = await getJson('gbif-vernacular', `https://api.gbif.org/v1/species/${key}/vernacularNames?limit=1000`);
  const tally = { en: new Map(), it: new Map(), es: new Map() };
  const datasets = new Map();
  let rejectedByLicense = 0;
  for (const entry of body?.results ?? []) {
    const lang = GBIF_LANG[entry.language];
    const name = cleanName(entry.vernacularName ?? '');
    if (!lang || badName(name, sci)) continue;
    const ds = await vernacularDataset(entry);
    if (!ds?.license) { rejectedByLicense++; continue; }
    const k = name.toLowerCase();
    const slot = tally[lang].get(k) ?? { count: 0, forms: new Map(), datasets: new Set() };
    slot.count++;
    slot.forms.set(name, (slot.forms.get(name) ?? 0) + 1);
    slot.datasets.add(ds.key);
    tally[lang].set(k, slot);
    datasets.set(ds.key, ds);
  }
  const names = {};
  for (const lang of LANGS) {
    names[lang] = [...tally[lang].entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([k, slot]) => ({ key: k, name: [...slot.forms.entries()].sort((a, b) => b[1] - a[1])[0][0], datasets: slot.datasets }));
  }
  return { names, datasets, rejectedByLicense };
}

// --- Wikipedia / Wikidata --------------------------------------------------
// Le richieste sono raggruppate (Action API, più titoli per chiamata): l'endpoint REST
// /page/summary, una specie alla volta, finisce subito in 429 con uno User-Agent anonimo.

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** action=query su più titoli, seguendo redirect e `continue`; ritorna titolo richiesto -> pagina. */
async function mwQuery(lang, params, titles, size) {
  const out = new Map();
  for (const group of chunk([...new Set(titles)], size)) {
    const base = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&${params}&titles=${encodeURIComponent(group.join('|'))}`;
    const pages = new Map();
    const alias = new Map();
    let cont = '';
    for (let guard = 0; guard < 30; guard++) {
      const { body } = await getJson(`wiki-query-${lang}`, base + cont);
      if (!body?.query) break;
      for (const m of [...(body.query.normalized ?? []), ...(body.query.redirects ?? [])]) alias.set(m.from, m.to);
      for (const p of body.query.pages ?? []) pages.set(p.title, { ...(pages.get(p.title) ?? {}), ...p });
      if (!body.continue) break;
      cont = '&' + new URLSearchParams(body.continue).toString();
    }
    for (const title of group) {
      let t = title;
      for (let hop = 0; hop < 4 && alias.has(t); hop++) t = alias.get(t);
      const page = pages.get(t);
      if (page && !page.missing && !page.invalid) out.set(title, page);
    }
  }
  return out;
}

/** Introduzione in testo semplice di ogni titolo; pagine di disambiguazione e pagine vuote escluse. */
async function wikiIntros(lang, titles) {
  const pages = await mwQuery(lang, 'prop=extracts%7Cpageprops&exintro=1&explaintext=1&exlimit=20&ppprop=wikibase_item%7Cdisambiguation', titles, 20);
  const out = new Map();
  for (const [asked, p] of pages) {
    const extract = (p.extract ?? '').replace(/[​‎‏﻿]/g, '').replace(/\s*\n+\s*/g, ' ').trim();
    if (!extract || p.pageprops?.disambiguation !== undefined) continue;
    out.set(asked, { title: p.title, extract, qid: p.pageprops?.wikibase_item ?? null });
  }
  return out;
}

/**
 * La pagina raggiunta chiedendo il binomio parla della specie?
 * Titolo = genere: solo se l'introduzione cita il binomio (genere monotipico, es. "Nerium").
 * Altro titolo: è un redirect dal binomio verso un sinonimo o un nome comune, quindi sì.
 */
function aboutSpecies(page, names) {
  const title = (page.title ?? '').toLowerCase();
  const genera = names.map((n) => n.split(' ')[0].toLowerCase());
  if (!genera.includes(title)) return true;
  const intro = page.extract.toLowerCase();
  return names.some((n) => intro.includes(n.toLowerCase()));
}

/** Titoli it/es collegati e nomi comuni (P1843) per ogni elemento Wikidata. */
async function wikidataEntities(qids) {
  const out = new Map();
  for (const group of chunk([...new Set(qids)], 50)) {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${group.join('%7C')}&props=claims%7Csitelinks&sitefilter=enwiki%7Citwiki%7Ceswiki&format=json`;
    const { body } = await getJson('wikidata', url);
    for (const qid of group) {
      const entity = body?.entities?.[qid];
      if (!entity) continue;
      const names = { en: [], it: [], es: [] };
      for (const claim of entity.claims?.P1843 ?? []) {
        const v = claim.mainsnak?.datavalue?.value;
        if (v && names[v.language]) names[v.language].push(cleanName(v.text));
      }
      const titles = {};
      for (const lang of LANGS) titles[lang] = entity.sitelinks?.[`${lang}wiki`]?.title ?? null;
      out.set(qid, { names, titles });
    }
  }
  return out;
}

/** Campi morfologici del {{mycomorphbox}} nel wikitext inglese (mai `howEdible`). */
function parseMycomorphbox(text) {
  const start = text.search(/\{\{\s*mycomorphbox/i);
  if (start < 0) return {};
  const end = text.indexOf('}}', start);
  if (end < 0) return {};
  const values = {};
  for (const part of text.slice(start + 2, end).split('|').slice(1)) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const rawKey = part.slice(0, eq).trim().toLowerCase();
    const value = part.slice(eq + 1).replace(/<!--.*?-->/gs, '').trim().toLowerCase();
    const field = MYCO_FIELDS[rawKey.replace(/\d+$/, '')];
    if (!field || !value || !/^[a-z][a-z ,/-]*$/.test(value)) continue;
    (values[field] ??= []).push(value);
  }
  const features = {};
  for (const [field, list] of Object.entries(values)) features[field] = [...new Set(list)].join(', ');
  return features;
}

/** Descrizioni en/it/es, dati Wikidata e features dei funghi per tutte le specie, in poche chiamate. */
async function wikipediaAll(list, gbifByName) {
  const namesOf = (sp) => [...new Set([sp.scientificName, gbifByName.get(sp.scientificName)?.acceptedName].filter(Boolean))];
  const result = new Map(list.map((sp) => [sp.scientificName, { pages: {}, wikidata: null, qid: null, features: {} }]));
  const pick = (map, sp) => namesOf(sp).map((n) => map.get(n)).find((p) => p && aboutSpecies(p, namesOf(sp)));

  const en = await wikiIntros('en', list.flatMap(namesOf));
  for (const sp of list) {
    const page = pick(en, sp);
    if (!page) continue;
    const r = result.get(sp.scientificName);
    r.pages.en = page;
    r.qid = page.qid;
  }
  // Nessuna pagina col nome della lista: si provano i sinonimi noti a GBIF.
  for (const sp of list) {
    const r = result.get(sp.scientificName);
    const key = gbifByName.get(sp.scientificName)?.key;
    if (r.pages.en || !key) continue;
    const { body } = await getJson('gbif-synonyms', `https://api.gbif.org/v1/species/${key}/synonyms?limit=100`);
    const synonyms = [...new Set((body?.results ?? []).filter((s) => s.rank === 'SPECIES' && s.canonicalName).map((s) => s.canonicalName))];
    if (!synonyms.length) continue;
    const pages = await wikiIntros('en', synonyms);
    const page = synonyms.map((n) => pages.get(n)).find((p) => p && aboutSpecies(p, synonyms));
    if (!page) continue;
    r.pages.en = page;
    r.qid = page.qid;
    r.viaSynonym = true;
  }
  const entities = await wikidataEntities([...result.values()].map((r) => r.qid).filter(Boolean));
  for (const r of result.values()) if (r.qid) r.wikidata = entities.get(r.qid) ?? null;

  for (const lang of ['it', 'es']) {
    const linked = (sp) => result.get(sp.scientificName).wikidata?.titles[lang];
    const intros = await wikiIntros(lang, list.flatMap((sp) => (linked(sp) ? [linked(sp)] : namesOf(sp))));
    for (const sp of list) {
      const page = linked(sp) ? intros.get(linked(sp)) : pick(intros, sp);
      if (page) result.get(sp.scientificName).pages[lang] = page;
    }
  }

  const fungi = list.filter((sp) => sp.kind === 'fungus' && result.get(sp.scientificName).pages.en);
  const wikitext = await mwQuery('en', 'prop=revisions&rvprop=content&rvslots=main', fungi.map((sp) => result.get(sp.scientificName).pages.en.title), 10);
  for (const sp of fungi) {
    const r = result.get(sp.scientificName);
    const text = wikitext.get(r.pages.en.title)?.revisions?.[0]?.slots?.main?.content;
    if (text) r.features = parseMycomorphbox(text);
  }
  return result;
}

// --- iNaturalist -----------------------------------------------------------

const mediumUrl = (photo) => photo.medium_url ?? photo.url?.replace(/\/square\./, '/medium.');
const acceptable = (photo) =>
  photo && PHOTO_LICENSES[photo.license_code?.toLowerCase()] && !(photo.flags?.length) && !photo.hidden && mediumUrl(photo);

/** Confronto tra nomi che ignora maiuscole e trattini ("bella-donna" = "belladonna"). */
const sameName = (a, b) => !!a && !!b && a.toLowerCase().replace(/-/g, '') === b.toLowerCase().replace(/-/g, '');

async function inatTaxon(names) {
  for (const name of names) {
    const { body } = await getJson('inat-taxa', `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(name)}&rank=species&per_page=10`);
    const active = (body?.results ?? []).filter((t) => t.is_active !== false && t.rank === 'species');
    // Nome identico, oppure sinonimo riconosciuto da iNaturalist (matched_term = nome cercato).
    const hit = active.find((t) => sameName(t.name, name)) ?? active.find((t) => sameName(t.matched_term, name));
    if (hit) return hit;
  }
  // Ultima risorsa: iNaturalist tratta il nome come sottospecie (es. "Bryonia cretica dioica").
  for (const name of names) {
    const [genus, epithet] = name.split(' ');
    const { body } = await getJson('inat-taxa', `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(name)}&per_page=10`);
    const hit = (body?.results ?? []).find((t) => t.is_active !== false && ['subspecies', 'variety'].includes(t.rank)
      && t.name?.startsWith(genus + ' ') && t.name.endsWith(' ' + epithet));
    if (hit) return hit;
  }
  return null;
}

/** Foto candidate in ordine di preferenza: default, foto del taxon, osservazioni research-grade. */
async function* photoCandidates(taxon) {
  if (acceptable(taxon.default_photo)) yield taxon.default_photo;
  const detail = await getJson('inat-taxon', `https://api.inaturalist.org/v1/taxa/${taxon.id}`);
  for (const tp of detail.body?.results?.[0]?.taxon_photos ?? []) if (acceptable(tp.photo)) yield tp.photo;
  const obs = await getJson('inat-observations',
    `https://api.inaturalist.org/v1/observations?taxon_id=${taxon.id}&quality_grade=research&photo_license=cc0,cc-by,cc-by-sa&order_by=votes&per_page=10`);
  for (const o of obs.body?.results ?? []) for (const p of o.photos ?? []) if (acceptable(p)) yield p;
}

async function photo(sp, id, gbif) {
  const file = join(IMAGES, `${id}.jpg`);
  const metaFile = join(CACHE, 'photo-choice', `${id}.json`);
  if (existsSync(metaFile)) {
    const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
    if (meta.none) return { image: null, taxon: meta.taxon ?? null };
    if (isJpeg(file)) return meta;
  }
  const taxon = await inatTaxon([...new Set([sp.scientificName, gbif?.acceptedName].filter(Boolean))]);
  let result = { none: true, image: null, taxon: null };
  if (taxon) {
    const taxonRef = { id: taxon.id, name: taxon.name };
    result.taxon = taxonRef;
    const tried = new Set();
    for await (const p of photoCandidates(taxon)) {
      if (tried.has(p.id) || tried.size >= 8) continue;
      tried.add(p.id);
      const res = await request(mediumUrl(p));
      if (!res.ok) { await res.arrayBuffer(); continue; }
      mkdirSync(IMAGES, { recursive: true });
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      if (!isJpeg(file)) { unlinkSync(file); continue; }
      result = {
        taxon: taxonRef,
        image: {
          file: `images/${id}.jpg`,
          license: p.license_code.toLowerCase(),
          attribution: p.attribution ?? '',
          sourceUrl: `https://www.inaturalist.org/photos/${p.id}`,
        },
      };
      break;
    }
  }
  mkdirSync(dirname(metaFile), { recursive: true });
  writeFileSync(metaFile, JSON.stringify(result));
  return result;
}

// --- assemblaggio ----------------------------------------------------------

/** Unisce liste di nomi senza duplicati (case-insensitive), al massimo MAX_NAMES. */
function mergeNames(lists, sci) {
  const seen = new Set();
  const out = [];
  for (const name of lists.flat()) {
    const k = name.toLowerCase();
    if (badName(name, sci) || seen.has(k)) continue;
    seen.add(k);
    out.push(name);
    if (out.length === MAX_NAMES) break;
  }
  return out;
}

async function buildRecord(sp, idByName, gaps, gbif, wiki) {
  const id = slug(sp.scientificName);
  const step = async (label, fn, fallback) => {
    try { return await fn(); } catch (err) { gaps.errors.push(`${sp.scientificName}: ${label}: ${err.message}`); return fallback; }
  };
  const vern = gbif ? await step('gbif vernacular', () => gbifVernacular(gbif.key, sp.scientificName), null) : null;
  const features = wiki.features;
  const pic = await step('inaturalist', () => photo(sp, id, gbif), { image: null, taxon: null });

  const commonNames = {};
  const usedDatasets = new Set();
  let usedWikidata = false;
  for (const lang of LANGS) {
    const fromGbif = vern?.names[lang] ?? [];
    const fromWikidata = wiki.wikidata?.names[lang] ?? [];
    commonNames[lang] = mergeNames([fromGbif.map((n) => n.name), fromWikidata], sp.scientificName);
    const kept = new Set(commonNames[lang].map((n) => n.toLowerCase()));
    const gbifKeys = new Set(fromGbif.map((n) => n.key));
    for (const n of fromGbif) if (kept.has(n.key)) n.datasets.forEach((d) => usedDatasets.add(d));
    if ([...kept].some((k) => !gbifKeys.has(k))) usedWikidata = true;
  }

  const descriptions = {};
  const sources = [];
  if (gbif) sources.push({ name: 'GBIF Backbone Taxonomy', url: `https://www.gbif.org/species/${gbif.key}`, license: 'CC BY 4.0' });
  for (const key of usedDatasets) {
    const ds = vern.datasets.get(key);
    sources.push({ name: `${ds.title} (via GBIF)`, url: `https://www.gbif.org/dataset/${key}`, license: ds.license });
  }
  if (usedWikidata) sources.push({ name: 'Wikidata', url: `https://www.wikidata.org/wiki/${wiki.qid}`, license: 'CC0 1.0' });
  for (const lang of LANGS) {
    const page = wiki.pages[lang];
    if (!page) continue;
    descriptions[lang] = page.extract;
    const url = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`;
    sources.push({ name: `Wikipedia (${lang})`, url, license: 'CC BY-SA 4.0' });
  }
  const images = pic.image ? [pic.image] : [];
  if (pic.image) {
    sources.push({ name: 'iNaturalist', url: `https://www.inaturalist.org/taxa/${pic.taxon.id}`, license: PHOTO_LICENSES[pic.image.license] });
  }

  if (!gbif) gaps.noGbif.push(sp.scientificName);
  else if (gbif.status !== 'ACCEPTED') gaps.gbifSynonym.push(`${sp.scientificName} -> ${gbif.acceptedName} (${gbif.status})`);
  if (gbif && gbif.matchType !== 'EXACT') gaps.gbifFuzzy.push(`${sp.scientificName} (${gbif.matchType})`);
  if (!images.length) gaps.noPhoto.push(sp.scientificName + (pic.taxon ? '' : ' (no iNaturalist taxon)'));
  if (!Object.keys(descriptions).length) gaps.noDescription.push(sp.scientificName);
  if (wiki.viaSynonym) gaps.descriptionViaSynonym.push(`${sp.scientificName} -> ${wiki.pages.en.title}`);
  if (vern?.rejectedByLicense) gaps.namesRejectedByLicense += vern.rejectedByLicense;

  return {
    id,
    scientificName: sp.scientificName,
    kind: sp.kind,
    taxonomy: gbif?.taxonomy ?? {},
    gbifKey: gbif?.key ?? null,
    commonNames,
    descriptions,
    features,
    toxicity: sp.toxicity,
    lookalikes: sp.lookalikes.map((n) => idByName.get(n)).filter(Boolean),
    sources,
    images,
  };
}

async function main() {
  const list = JSON.parse(readFileSync(join(DATA, 'species-list.json'), 'utf8'));
  const idByName = new Map(list.map((sp) => [sp.scientificName, slug(sp.scientificName)]));
  const todo = only ? list.filter((sp) => sp.scientificName === only) : list;
  const gaps = { noGbif: [], gbifSynonym: [], gbifFuzzy: [], noPhoto: [], noDescription: [], descriptionViaSynonym: [], namesRejectedByLicense: 0, errors: [] };
  /** Esegue fn su ogni specie con al massimo CONCURRENCY in parallelo, mantenendo l'ordine. */
  const pool = async (label, fn) => {
    const out = new Array(todo.length);
    let next = 0;
    let done = 0;
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (next < todo.length) {
        const i = next++;
        out[i] = await fn(todo[i]);
        if (++done % 50 === 0 || done === todo.length) console.log(`${label}: ${done}/${todo.length}`);
      }
    }));
    return out;
  };
  const matches = await pool('gbif', (sp) => gbifMatch(sp).catch((err) => { gaps.errors.push(`${sp.scientificName}: gbif match: ${err.message}`); return null; }));
  const gbifByName = new Map(todo.map((sp, i) => [sp.scientificName, matches[i]]));
  let wikiByName;
  try {
    wikiByName = await wikipediaAll(todo, gbifByName);
  } catch (err) {
    gaps.errors.push(`wikipedia: ${err.message}`);
    wikiByName = new Map();
  }
  console.log('wikipedia: fatto');
  const emptyWiki = { pages: {}, wikidata: null, qid: null, features: {} };
  const records = await pool('specie', (sp) => buildRecord(sp, idByName, gaps, gbifByName.get(sp.scientificName), wikiByName.get(sp.scientificName) ?? emptyWiki));
  if (only) {
    console.log(JSON.stringify(records[0], null, 2));
    return;
  }
  writeFileSync(join(DATA, 'species.json'), JSON.stringify(records, null, 2) + '\n');
  const unlicensed = [...datasetBySource.entries()];
  const datasetReport = [];
  for (const [source, p] of unlicensed) {
    const ds = await p;
    datasetReport.push({ source, license: ds?.license ?? null, rawLicense: ds?.rawLicense ?? null });
  }
  writeFileSync(join(DATA, 'build-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), species: records.length, gaps, vernacularSources: datasetReport }, null, 2) + '\n');
  console.log(`species.json: ${records.length} record; senza foto ${gaps.noPhoto.length}, senza GBIF ${gaps.noGbif.length}, senza descrizione ${gaps.noDescription.length}, errori ${gaps.errors.length}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
