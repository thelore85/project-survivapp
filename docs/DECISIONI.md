# Decisioni

Scelte prese durante lo sviluppo autonomo. Ogni voce: cosa, perché, come cambiarla.

## Struttura

- **Monorepo con npm workspaces** (`packages/core`, `apps/mobile`, `tools/package-builder`).
  - Perché: è già incluso in npm, nessuno strumento in più.
  - Per cambiare: sostituire il campo `workspaces` con la configurazione di pnpm o Turborepo.
- **Tutta la logica in `packages/core`, TypeScript puro**, senza dipendenze da React Native.
  - Perché: è la parte verificabile su PC; i test girano in Node.
  - Per cambiare: non conviene; è il vincolo che rende testabile il progetto.

## Persistenza

- **Due database con lo stesso schema**: `content.db` nel pacchetto base (sola lettura) e `user.db` per cronologia, impostazioni e file utente.
  - Perché: il pacchetto base non modificabile diventa un file che l'app non scrive mai; aggiornarlo significa sostituire il file.
  - Per cambiare: unire le tabelle in un solo database e aggiungere una colonna di origine.
- **Indice vettoriale a forza bruta in memoria**, embedding salvati come BLOB in SQLite.
  - Perché: con qualche migliaio di passaggi basta, funziona identico su Node, browser e telefono, non richiede estensioni native.
  - Per cambiare: `expo-sqlite` può includere `sqlite-vec` (`withSQLiteVecExtension`); va sostituito il metodo `vectorSearch` di `LibraryStore`.
- **Ricerca ibrida con Reciprocal Rank Fusion**.
  - Perché: fonde full-text e semantica usando le posizioni, senza dover confrontare punteggi su scale diverse.
  - Per cambiare: `hybridSearch` in `packages/core/src/library/search.ts`.

## Modelli

- **Tre interfacce** (`LlmRuntime`, `TextEmbedder`, `VisionEmbedder`), ognuna con un'implementazione finta e una reale.
  - Perché: i modelli reali non sono verificabili senza telefono; i finti permettono test e demo.
  - Per cambiare modello: scrivere una nuova classe che implementa l'interfaccia e registrarla nel `ModelManager`.
- **L'identificativo del modello di embedding è salvato nel database**; se non coincide con il modello attivo la ricerca semantica (o il confronto visivo) si disattiva invece di dare risultati sbagliati.
  - Perché: vettori calcolati da modelli diversi non sono confrontabili.
  - Per cambiare modello: ricostruire il pacchetto base con il nuovo modello.
- **Soglie del profilo di esecuzione** (12 GB / 8 GB / 6 GB di RAM) scelte a stima.
  - Perché: mancano i benchmark sul dispositivo.
  - Per cambiare: `selectProfile` in `packages/core/src/models.ts`.

## Sicurezza

- **La struttura della risposta la costruisce il codice, non il modello**: candidati, citazioni e avvisi non vengono mai letti dal testo generato.
  - Perché: un modello che sbaglia o viene manipolato non può inventare una fonte o togliere un avviso.
- **Il testo generato che viola una policy viene scartato per intero**, non corretto.
  - Perché: riscrivere una frase pericolosa è più rischioso che non mostrarla.
- **Le ipotesi ("se è cotto è commestibile") contano come via libera**.
  - Perché: nel dubbio meglio scartare una frase innocua che lasciarne passare una pericolosa. Costo: qualche spiegazione generata in meno.
- **Le frasi di commestibilità vengono tolte anche dalle descrizioni di catalogo** (testi di Wikipedia).
  - Perché: accanto a un candidato da foto, "fungo commestibile pregiato" suona come un via libera.
- **Le domande sul consumo escludono i testi storici dalla ricerca**.
  - Perché: i manuali di funghi del 1894-1909 danno giudizi di commestibilità superati.
- **Le quantità con unità di misura nel testo generato devono comparire in una fonte**, altrimenti la risposta generata viene scartata.
  - Perché: è il controllo deterministico contro dosaggi e tempi inventati.
- **Il testo generato non viene mostrato mentre arriva**: l'interfaccia mostra solo l'avanzamento.
  - Perché: i controlli si fanno sul testo completo; mostrare prima significherebbe mostrare testo non verificato.

## Orchestratore

- **Classificazione dell'intento solo a regole**, nessun modello.
  - Perché: il PRD la vuole deterministica; il modello per i casi ambigui è opzionale e non serviva per il set di test.
  - Per cambiare: aggiungere un passo dopo `classifyIntent` quando il dominio è `clarification_required`.
- **Rilevamento dei conflitti tra fonti affidato a un marcatore del modello** (`[[CONFLICT]]`).
  - Perché: non esiste un controllo deterministico affidabile. Limite noto: con il modello finto scatta solo nei test.

## Decisioni aperte del PRD

- **Riconoscimento botanico**: solo embedding visivi, nessun classificatore dedicato.
  - Per cambiare: una classe che implementa `VisionEmbedder` oppure un nuovo passo in `identifyFromPhoto`.
- **Modello multimodale**: non usato per l'analisi delle immagini; il modello linguistico riceve solo testo.
- **Versione minima di Android e dispositivi supportati**: non decisi; il profilo di esecuzione disattiva le funzioni dove le risorse non bastano.
- **Elenco delle specie e licenze**: vedi `data/catalogue/README.md`.
