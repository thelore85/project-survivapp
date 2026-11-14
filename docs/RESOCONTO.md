# Resoconto dello sviluppo autonomo

Sessione del 14 novembre 2026. Scritto per chi non ha seguito il lavoro.

In una frase: la logica dell'app e la demo nel browser funzionano e sono coperte da test; tutto ciò che riguarda il telefono e i modelli AI reali è scritto ma non è mai stato eseguito.

## 1. Verificato

Ogni voce ha il comando che la dimostra, lanciato dalla root del progetto, e l'esito ottenuto.

| Cosa | Comando | Esito |
|---|---|---|
| Tipi, lint e test | `npm run check` | nessun errore; 168 test del core e 4 del costruttore di pacchetti, tutti verdi |
| Pacchetto demo dai dati reali | `npm run build:package` | 325 specie, 9 documenti, 6.019 passaggi, `content.db` da 16,4 MB |
| Catalogo delle specie | `node tools/catalogue/validate-catalogue.mjs` | `OK: nessun errore`; 325 specie, 322 con fotografia |
| App nel browser, in modalità demo | `npm run web`, poi `npm run smoke` | 12 passi su 12 `ok`, nessun errore nella console del browser |
| Bundle JavaScript per Android | in `apps/mobile`: `npx expo export --platform android` | bundle Hermes da 5,9 MB creato |
| Progetto Android nativo | in `apps/mobile`: `npx expo prebuild --platform android` | cartella `android/` generata, plugin applicati |

Cosa coprono i test del core, in parole semplici:

- **Routing**: 38 frasi in italiano, inglese e spagnolo finiscono nel dominio atteso (botanica, survival, misto, generale, da chiarire).
- **Chiarimento**: una richiesta ambigua genera una domanda, e la risposta dell'utente riprende la domanda rimasta in sospeso.
- **Contesto**: dopo una foto, "qual è il suo habitat?" arriva al modulo botanico con le specie candidate.
- **Survival**: il passaggio pertinente viene trovato e citato con documento, pagina e sezione; se le fonti non bastano l'app lo dichiara e non chiama il modello.
- **Citazioni**: un riferimento `[8]` senza fonte viene tolto; una risposta senza citazioni valide viene scartata.
- **Dosaggi**: una quantità con unità di misura che non compare nelle fonti fa scartare la risposta generata.
- **Botanica**: una foto produce candidati collegati alle schede, mai una certezza; foto scura, piccola o piatta viene rifiutata.
- **Commestibilità**: un testo generato che dice "commestibile", "sicuro", "innocuo", una percentuale o una certezza viene scartato; le stesse frasi vengono tolte anche dalle descrizioni di catalogo.
- **Prompt injection**: un documento che contiene istruzioni resta dentro il proprio blocco delimitato; anche con un modello che obbedisce, il via libera non arriva all'utente.
- **File utente**: formato non ammesso, file oltre 100 MB e quota superata vengono rifiutati con messaggio; la quota modificata resta dopo il riavvio; nessun limite sul numero di file.
- **Modelli**: caricamento su richiesta, rilascio del meno usato, nuovo tentativo dopo un errore di memoria, funzione disattivata se fallisce ancora.

Cosa copre lo smoke test nel browser:

- avvio con il pacchetto demo;
- domanda survival con fonti, pagina e avviso;
- fonti insufficienti dichiarate;
- richiesta ambigua con opzioni di chiarimento;
- foto dalla galleria con candidati, avvisi, nessuna percentuale, apertura della scheda;
- importazione di un file di testo e rifiuto di un formato non ammesso;
- il file importato diventa una fonte citata;
- lingua e quota che restano dopo il ricaricamento della pagina;
- cronologia che resta e si riapre;
- layout da telefono senza scorrimento orizzontale.

Ciò che la demo **non** dimostra: usa modelli finti. Le risposte sono estratti dei manuali, non testo generato da un'AI; i candidati botanici sono scelti per somiglianza di colore, non per riconoscimento. La qualità delle risposte e dell'identificazione non è stata misurata in alcun modo.

## 2. Scritto ma non verificato

Tutto ciò che segue compila e supera il controllo dei tipi, ma non è mai stato eseguito.

| Cosa | Dove | Cosa può andare storto |
|---|---|---|
| Build Android con Gradle | `npx expo run:android` | errori di compilazione dei moduli nativi `llama.rn` e `onnxruntime-react-native`; versioni di NDK o Gradle incompatibili |
| Database nativo | `apps/mobile/src/platform/index.native.ts` | il percorso passato a `expo-sqlite` per aprire `content.db` dalla cartella del pacchetto potrebbe essere nel formato sbagliato |
| Installazione del pacchetto dal telefono | `installPackage` nello stesso file | il selettore di cartelle di Android restituisce indirizzi `content://`: elencare e copiare i file potrebbe non funzionare come con i percorsi normali |
| LLM reale (ipotesi Gemma 3n E2B) | `runtimes.native.ts`, classe `LlamaLlm` | modello non disponibile in formato GGUF, memoria insufficiente, lentezza, parametri di contesto da ritarare |
| Embedding testuali reali (ipotesi EmbeddingGemma) | classe `LlamaTextEmbedder` | prefissi di domanda e documento scritti a memoria dalla scheda del modello; soglia di pertinenza (0,3) mai tarata |
| Visione reale (ipotesi BioCLIP 2) | classe `OnnxVisionEmbedder` | l'export in ONNX va fatto e non l'ho provato; normalizzazione e nomi di ingresso e uscita assunti; soglia (0,2) mai tarata |
| Ricalcolo degli indici sul telefono | `reindexPackage` | durata non misurata (circa 6.000 passaggi e 322 foto); se l'app viene chiusa a metà gli indici restano parziali |
| Fotocamera | `apps/mobile/src/platform/images.ts` | lo smoke test prova solo la galleria; permessi e scatto su Android non provati |
| Profilo di esecuzione | `selectProfile` nel core | le soglie di RAM (12, 8, 6 GB) sono stime senza benchmark |
| Funzionamento in modalità aereo | intera app | sul telefono non c'è nulla che richieda la rete, ma non è stato provato |

Il primo passo consigliato è la sezione 1 di `docs/CHECKLIST-PIXEL.md`: installare il pacchetto demo sul telefono, senza modelli reali. Separa i problemi dell'app da quelli dei modelli.

## 3. Non fatto

Rispetto al PRD:

- **Importazione di PDF sul telefono**. Funziona nel browser e nel costruttore di pacchetti; sul telefono solo file di testo. Motivo: pdf.js non gira sul motore JavaScript di React Native, serve un modulo nativo da scegliere.
- **Pacchetto con embedding dei modelli reali costruito sul PC**. Il costruttore usa solo i modelli finti. Rimedio previsto: ricalcolo degli indici sul telefono (non verificato).
- **POC A-D e benchmark**. Richiedono il dispositivo. L'app mostra il tempo di risposta e di caricamento dei modelli per raccoglierli.
- **Soglie numeriche delle metriche** (sezione 17 del PRD). Dipendono dai benchmark.
- **Revisione specifica dei contenuti di primo soccorso**. L'app aggiunge avvisi e il numero di emergenza, ma nessuno ha rivisto i contenuti dei manuali.
- **Rilevamento deterministico delle fonti discordanti**. L'app si affida a un marcatore prodotto dal modello; con il modello finto scatta solo nei test.
- **Uso del modello linguistico per le richieste ambigue**. La classificazione è solo a regole; il PRD lo indicava come facoltativo.
- **Conservazione del file originale importato dall'utente**. Si salva il testo indicizzato, non il file.
- **Pulizia delle cache dall'interfaccia**. Non ci sono cache gestite, a parte le miniature delle foto salvate nella cronologia.
- **Tema scuro su Android**. Richiede il modulo `expo-system-ui`, non installato; nel browser il tema scuro funziona.
- **Rimozione del permesso `INTERNET`** dalla build di rilascio. Serve durante lo sviluppo.
- **Test automatici dei componenti dell'interfaccia**. L'interfaccia è coperta solo dallo smoke test.

Limiti dei dati:

- **Tossicità, note e specie simili del catalogo sono state scritte da un assistente AI**, non da un esperto. Vanno riviste prima di qualsiasi uso reale.
- 3 specie su 325 non hanno una fotografia con licenza accettabile, quindi non possono comparire tra i candidati di una foto: *Amanita vaginata*, *Paralepistopsis amoenolens*, *Ramaria formosa*.
- Nessuno ha controllato a occhio che ogni fotografia mostri davvero la specie indicata.
- Mancano il nome comune italiano per 96 specie e quello spagnolo per 67; la descrizione italiana per 14, quella spagnola per 22.
- Una sola fotografia per specie: è poco per un confronto visivo affidabile.
- I manuali survival sono militari statunitensi; i testi di botanica hanno oltre cent'anni e sono marcati come storici. La penisola iberica non è coperta dai testi, solo dal catalogo.
- Il testo dei PDF storici arriva da OCR e contiene errori; alcune pagine non hanno testo estraibile (268 in tutto, elencate dal costruttore).

## 4. Punti che richiedono una tua decisione

- **Passaggi dei manuali che parlano di commestibilità**. Le fonti citate vengono mostrate così come sono scritte: un passaggio del manuale dell'esercito può dire che una pianta è commestibile. L'app aggiunge l'avviso rosso ed esclude i testi storici, ma non modifica il testo della fonte. Alternativa: togliere quelle frasi anche dai passaggi, al costo di mostrare una fonte incompleta.
- **Filtro sulla commestibilità**. È un elenco di espressioni in tre lingue: è prudente ma non completo, e scarta anche frasi innocue. Sulle descrizioni reali del catalogo ho trovato e coperto formule indirette ("prelibatezza", "widely eaten"); altre possono sfuggire.
- **Descrizioni di catalogo**. Vengono da Wikipedia e conservano la licenza CC BY-SA 4.0, che impone attribuzione e stessa licenza a chi le ridistribuisce.
- **Diritti sui testi**. Per quattro testi di botanica l'anno di morte dell'autore è da confermare (`knowledge_base/SOURCES.md`).

## 5. Ambiente

- `npm install` va lanciato da PowerShell: da Git Bash l'installazione di `llama.rn` fallisce.
- Ripetere `npm install` rompeva i test: risolto dichiarando `vite`, `esbuild` e `rolldown` nella root (dettagli nel `README.md`).
- Il server di sviluppo usato per lo smoke test è stato fermato a fine sessione.
- Nessun push: la repo non ha un remote.
