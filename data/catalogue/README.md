# Catalogo specie

Dati offline per l'app: piante e funghi di Spagna, Italia ed Europa centrale.

## Avvertenza

- **Livelli di tossicità, note e collegamenti tra sosia (`toxicity`, `lookalikes`) sono stati scritti da un assistente AI.**
- **Vanno rivisti da un esperto qualificato (micologo, botanico, tossicologo) prima di qualsiasi uso reale.**
- `none_recorded` significa solo "nessuna avvertenza registrata qui": non è mai un'indicazione di commestibilità o sicurezza.
- Le descrizioni arrivano da Wikipedia senza filtri: possono contenere affermazioni sulla commestibilità. Non fanno parte del dato di sicurezza.
- L'elenco dei sosia non è esaustivo.

## File

- `species-list.json` — lista curata (sorgente): nome scientifico, tipo, tossicità, sosia. Si modifica a mano.
- `species.json` — output generato: un record per specie. Non si modifica a mano.
- `images/{id}.jpg` — una foto per specie, formato medio di iNaturalist.
- `build-report.json` — lacune dell'ultima build (senza foto, senza GBIF, sinonimi, errori) e licenze dei dataset dei nomi comuni.
- `.cache/` — risposte API grezze, ignorate da git.

## Fonti e licenze

- **GBIF Backbone Taxonomy** — tassonomia e `gbifKey`. CC BY 4.0 (doi:10.15468/39omei).
- **Checklist pubblicate su GBIF** — nomi comuni en/it/es. Tenuti solo i nomi da dataset CC0 1.0 o CC BY 4.0; il dataset esatto è in `sources` di ogni record.
- **Wikidata** — nomi comuni aggiuntivi (proprietà P1843) e collegamenti tra le pagine Wikipedia. CC0 1.0.
- **Wikipedia (en, it, es)** — `descriptions` (introduzione della voce). CC BY-SA 4.0: richiede attribuzione e stessa licenza per le opere derivate.
- **Wikipedia (en), template `mycomorphbox`** — `features` dei funghi. CC BY-SA 4.0. Il campo di commestibilità (`howEdible`) è escluso di proposito.
- **iNaturalist** — foto. Accettate solo CC0, CC BY, CC BY-SA; scartate NC, ND e foto senza licenza. Licenza, attribuzione e URL di ogni foto sono in `images`.
- **Tossicità, note, sosia** — contenuto originale scritto da un assistente AI, non verificato.

## Ricostruire

Serve Node 22, nessuna dipendenza.

```
node tools/catalogue/build-catalogue.mjs
node tools/catalogue/validate-catalogue.mjs
```

- La build è riprendibile: ciò che è in `.cache/` non viene richiesto di nuovo.
- Per aggiornare i dati di una fonte, cancellare la relativa sottocartella di `.cache/`.
- Per cambiare la foto di una specie, cancellare `.cache/photo-choice/{id}.json` e `images/{id}.jpg`.
- Una sola specie, senza scrivere `species.json`: `node tools/catalogue/build-catalogue.mjs --only="Amanita phalloides"`.
- Il validatore esce con codice 1 se trova errori.

## Note sui dati

- `scientificName` è quello della lista; se GBIF lo considera sinonimo, `gbifKey` e `taxonomy` sono quelli del nome accettato.
- `features` usa le chiavi `capShape`, `hymeniumType`, `gillAttachment`, `stipeCharacter`, `sporePrintColor`, `ecologicalType`; più valori sono separati da virgola.
- Dati mancanti: array o oggetti vuoti, `gbifKey` a `null`. Nessun valore inventato.
