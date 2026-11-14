# Survivapp

Assistente offline per botanica e sopravvivenza: confronta la foto di una pianta o di un fungo con un catalogo locale e risponde a domande sui manuali salvati sul dispositivo. Requisiti in `PRD.md`.

Stato attuale: tutto il codice è verificato sul PC con modelli finti. Nulla è stato provato su un telefono: vedi `docs/RESOCONTO.md`.

## Requisiti

- Node 22.
- Windows: lanciare `npm install` da **PowerShell**. Da Git Bash l'installazione di `llama.rn` fallisce, perché il suo script usa `tar` e quello di Git Bash non gestisce i percorsi `C:\`.
- Edge o Chrome, solo per lo smoke test automatico.

## Avvio della demo nel browser

Dalla root del progetto, un comando per volta.

```
npm install
```

Atteso: termina senza errori; scarica circa 1,3 GB (librerie native di `llama.rn`).

```
npm run build:package
```

Atteso: elenco dei documenti e, in fondo, `pacchetto demo 0.1.0` con numero di specie, documenti e passaggi. Richiede i PDF in `knowledge_base/` (fonti in `knowledge_base/SOURCES.md`) e il catalogo in `data/catalogue/`.

```
npm run vendor -w @survivapp/mobile
```

Atteso: `librerie copiate in ...public\vendor`.

```
npm run web
```

Atteso: `Waiting on http://localhost:8081`. Aprire quell'indirizzo: compare la chat con la fascia "Modalità demo".

La demo usa modelli finti: le risposte sono estratti dei manuali, i candidati botanici sono scelti per somiglianza di colore. Serve a provare i flussi, non la qualità.

## Controlli

```
npm run check
```

Atteso: controllo dei tipi, lint e test senza errori (153 test del core, 4 del costruttore di pacchetti).

```
npm run smoke
```

Atteso: dieci righe `ok`. Va lanciato con `npm run web` attivo in un altro terminale; le schermate finiscono in `dist/smoke/`.

## Struttura

- `packages/core`: tutta la logica, TypeScript puro. Orchestratore, ricerca nei documenti, modulo botanico, modulo survival, policy di sicurezza, configurazione, file utente.
- `apps/mobile`: app Expo (React Native, NativeWind, Zustand). `src/platform` contiene ciò che cambia tra browser e Android.
- `tools/package-builder`: costruisce il pacchetto base dai PDF e dal catalogo.
- `tools/catalogue`: scarica e valida i dati delle specie da fonti aperte.
- `knowledge_base`: manuali di pubblico dominio (i PDF non sono versionati).
- `data/catalogue`: elenco curato delle specie e dati generati.
- `docs`: decisioni, stato dei lavori, resoconto, checklist di prova sul telefono.

## Pacchetto base

Una cartella con:

- `manifest.json`: identificativo, versione, configurazione di default, modelli previsti.
- `content.db`: documenti indicizzati e catalogo delle specie, in sola lettura.
- `images/`: fotografie del catalogo.
- `models/`: pesi dei modelli. Vuota nel pacchetto demo.

Per un pacchetto con modelli reali:

1. Copiare i file dei modelli in `models/`.
2. In `manifest.json`, sotto `models`, indicare per ciascuno `id` e `file` (e, se serve, `relevanceThreshold`).
3. Copiare la cartella sul telefono e installarla da Impostazioni → Pacchetto installato.
4. Lanciare da Impostazioni il ricalcolo degli indici: il pacchetto nasce indicizzato con i modelli finti.

## Catalogo delle specie

```
node tools/catalogue/build-catalogue.mjs
```

Atteso: avanzamento per specie; riprende da dove si era fermato grazie alla cache. Fonti, licenze e limiti in `data/catalogue/README.md`.

## Android

Non ancora provato. Passi e misure da raccogliere in `docs/CHECKLIST-PIXEL.md`.

## Problemi noti dell'ambiente

- Dopo aver aggiunto una dipendenza con `npm install <pacchetto>` può comparire `Cannot find native binding` o `@esbuild/win32-x64 could not be found`: è un difetto di npm con le dipendenze opzionali. Rimedio: cancellare `node_modules` e `package-lock.json`, poi `npm install` da PowerShell.
- Il server web avviato con la variabile `CI=1` non ricarica il codice modificato.
