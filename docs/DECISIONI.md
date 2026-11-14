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

## App e piattaforme

- **Expo SDK 57, non 58**.
  - Perché: NativeWind 4.2.7, l'ultima versione stabile, dichiara il supporto fino all'SDK 57.
  - Per cambiare: aggiornare quando NativeWind dichiara il supporto all'SDK successivo; rilanciare smoke test.
- **Componenti scritti a mano nello stile di React Native Reusables** (`cva`, `cn`, token di tema), non generati con il suo strumento a riga di comando.
  - Perché: lo strumento è interattivo e non adatto a una sessione autonoma; il risultato segue le stesse convenzioni.
  - Per cambiare: sostituire i componenti in `apps/mobile/src/components/ui` con quelli generati.
- **Nessuna libreria di navigazione**: quattro schermate scelte da uno stato in Zustand.
  - Perché: è la soluzione più semplice per quattro schermate senza indirizzi.
  - Per cambiare: introdurre `expo-router` quando servono collegamenti diretti o il tasto indietro di Android.
- **Uno strato `platform` con due implementazioni** (browser e Android) dietro la stessa interfaccia.
  - Perché: database, pacchetto, modelli ed estrazione del testo sono le sole parti che cambiano.
- **Nel browser SQLite è la build WebAssembly ufficiale, caricata a runtime** e non dal bundle.
  - Perché: la versione web di `expo-sqlite` non ha la ricerca full-text; la build ufficiale sì, ma usa `import.meta`, che il bundler non gestisce.
- **Nel browser il database utente vive in memoria e viene copiato in IndexedDB** poco dopo ogni scrittura.
  - Perché: dà persistenza alla demo con poche righe. Limite: una chiusura entro mezzo secondo dall'ultima scrittura la perde.
- **Sul telefono il pacchetto base si installa scegliendo una cartella**, che l'app copia nel proprio spazio privato.
  - Perché: i modelli pesano alcuni GB e non possono stare dentro l'app installabile.
- **Gli indici del pacchetto si possono ricalcolare sul telefono** con i modelli installati.
  - Perché: garantisce che pacchetto e dispositivo usino lo stesso modello senza dover far girare i modelli reali sul PC. Costo: alcuni minuti alla prima installazione.
  - Per cambiare: calcolare gli embedding reali nel costruttore di pacchetti, passando a `buildPackage` un `textEmbedder` e un `vision` reali.
- **Sul telefono l'importazione di PDF non è implementata**: solo file di testo.
  - Perché: pdf.js non gira sul motore JavaScript di React Native; serve un modulo nativo ancora da scegliere.
- **Le soglie di pertinenza dei modelli reali stanno nel manifest** (`relevanceThreshold`).
  - Perché: vanno tarate con i benchmark e non devono richiedere una nuova build dell'app.
- **Il modello finto di embedding decide la pertinenza solo sulle parole**, non sul coseno, e traduce la domanda con un piccolo glossario.
  - Perché: il coseno di un hash non distingue un vero riscontro da una collisione. Riguarda solo la demo.
- **Smoke test con `playwright-core` e il browser già installato** (Edge o Chrome).
  - Perché: evita di scaricare un browser dedicato.

- **Una domanda breve dopo una risposta survival eredita l'argomento della domanda precedente**, sia per cercare sia per giudicare la pertinenza.
  - Perché: "che materiali usare?" da sola non contiene l'argomento.
  - Per cambiare: `previousQuestion` in `answerSurvival`.
- **Tema scelto a mano** (sistema, chiaro, scuro) con le classi di NativeWind, salvato tra le impostazioni dell'utente.

## Decisioni aperte del PRD

- **Riconoscimento botanico**: solo embedding visivi, nessun classificatore dedicato.
  - Per cambiare: una classe che implementa `VisionEmbedder` oppure un nuovo passo in `identifyFromPhoto`.
- **Modello multimodale**: non usato per l'analisi delle immagini; il modello linguistico riceve solo testo.
- **Versione minima di Android e dispositivi supportati**: non decisi; il profilo di esecuzione disattiva le funzioni dove le risorse non bastano.
- **Elenco delle specie e licenze**: vedi `data/catalogue/README.md`.
