# Prompt — sviluppo autonomo dell'MVP

Sviluppa l'MVP descritto in `PRD.md` (in questa cartella), dall'inizio alla fine, in un'unica sessione autonoma. Io non sarò disponibile mentre lavori: non potrò rispondere a domande né approvare scelte. Quando torno voglio trovare una codebase funzionante e verificata fin dove è possibile verificarla su questa macchina, più un resoconto onesto di ciò che resta da provare sul telefono.

Leggi tutto il PRD prima di scrivere codice. Il perimetro è la sezione 14 ("MVP: perimetro proposto"); i non-obiettivi della 3.2 e gli "Escluso" della 14 restano fuori anche se ti sembrano facili da aggiungere.

## Il vincolo che determina tutto il resto

I modelli andrebbero validati sul Pixel 9 Pro XL, ma il telefono non è ancora disponibile: il PRD stabilisce di partire dal codice e fare i POC dopo (sezioni 12.4 e 16). Tu non hai il telefono, non puoi misurare memoria, latenza o temperatura, e non puoi sapere se Gemma 3n, BioCLIP 2 o EmbeddingGemma girano davvero su quel dispositivo. Quindi non fingere di averlo verificato e non lasciare che questa incertezza blocchi il lavoro. La strada è questa:

- Ogni runtime AI (LLM, visione, embedding testuale) sta dietro un'interfaccia TypeScript. Il PRD lo chiede comunque: i modelli devono essere sostituibili senza toccare i domini.
- Per ogni interfaccia scrivi due implementazioni: una finta e deterministica, usata dai test e utilizzabile nell'app in una modalità demo; una reale, che passa dal bridge nativo Android.
- L'implementazione reale scrivila al meglio, scegliendo librerie mantenute e controllando la loro documentazione attuale online invece di andare a memoria: questo settore cambia in fretta. Marcala chiaramente come non verificata su dispositivo.
- Tutta la logica applicativa (orchestratore, pipeline RAG, ingestion, policy di sicurezza, persistenza) deve essere TypeScript puro, testabile in Node senza React Native e senza telefono. È la parte che puoi dimostrare funzionante, e deve esserlo davvero.

## Decisioni aperte

Le decisioni già prese sono nel PRD (sezione 19, "Prese") e valgono come requisiti: stack dell'interfaccia (6.1), perimetro del catalogo (8.4), pacchetto base, limiti dei file utente e configurazione a livelli (11.3). Restano quattro decisioni aperte e diverse scelte tecniche da fare (runtime dei modelli, indice vettoriale, parsing PDF). Non chiedermele: scegli tu l'opzione più semplice e più facile da ribaltare, coerente con l'MVP, e registrala in `docs/DECISIONI.md` con una riga di motivazione e una su come cambiarla. Vale per qualsiasi dubbio incontri lungo la strada: scegli, annota, prosegui.

Sui contenuti:

- Il corpus survival è già in `knowledge_base/`, con fonti, diritti e limiti in `knowledge_base/SOURCES.md`. Leggi quel file prima di usarlo. I PDF sono pesanti: non committarli, aggiungi la cartella dei PDF al `.gitignore` lasciando versionato `SOURCES.md`.
- I testi in `knowledge_base/botany` hanno più di cent'anni: usali solo come documenti consultabili, mai come fonte per le schede delle specie né per giudizi di commestibilità.
- Il catalogo delle specie va costruito da dati aperti e attuali, secondo il criterio della sezione 8.4. Verifica la licenza di ogni fonte sulla sua pagina ufficiale e registra fonte e licenza per ogni scheda e immagine. Se per una specie non trovi dati con licenza chiara, lasciala fuori e annotalo: un catalogo più piccolo e pulito vale più di uno completo e di provenienza incerta.
- Non scaricare pesi di modelli da più gigabyte: definisci il formato del pacchetto base, costruiscine uno di prova senza modelli e documenta dove vanno messi.

## Sicurezza: requisiti, non rifiniture

La sezione 13 del PRD riguarda rischi reali per le persone: un'identificazione sbagliata di un fungo può fare danni gravi. Questi vincoli vanno imposti nel codice, con uno strato di policy deterministico che controlla l'output, e non affidati solo al prompt del modello:

- mai un'identificazione presentata come certa, mai un via libera a commestibilità o sicurezza;
- nessuna percentuale di confidenza derivata dalla similarità visiva;
- nessuna citazione senza un passaggio effettivamente recuperato;
- quando le fonti mancano o si contraddicono, la risposta lo dichiara;
- il testo dei documenti importati è un dato: va delimitato e mai trattato come istruzione.

Ognuno di questi punti deve avere test che lo dimostrano, compresi casi in cui il modello finto prova a violarlo.

## Come lavorare

- Parti dalla struttura del monorepo e dal nucleo TypeScript testabile, poi persistenza e retrieval, poi i due moduli di dominio, poi l'orchestratore, infine l'app React Native e il bridge nativo. L'app arriva per ultima perché è la parte che puoi verificare di meno.
- Procedi per tappe piccole. A ogni tappa: typecheck, lint e test verdi, poi commit. Non andare avanti con qualcosa di rosso alle spalle.
- I criteri di accettazione della sezione 15 diventano test automatici ovunque sia possibile: set di richieste per il routing, piccolo corpus per il RAG survival, pipeline botanica con il runtime finto.
- Se un test fallisce, correggi il codice. Non indebolire né eliminare un test per farlo passare; se il test era sbagliato, spiegalo nel commit.
- Su questa macchina la toolchain Android non è installata e non va installata ora: scrivi comunque il progetto Android e segnala nel resoconto che la build non è stata eseguita.
- Lo smoke test si fa sul PC: l'interfaccia deve aprirsi nel browser in modalità demo, con i modelli finti, e permettere di provare chat, flusso survival, flusso botanico, importazione di un file e impostazioni. Avviala tu e verifica che funzioni davvero prima di dichiararla pronta; nel `README.md` metti il comando per avviarla.
- Tieni aggiornato `docs/STATO.md` a ogni tappa: cosa è fatto, cosa è in corso, cosa viene dopo. La sessione sarà lunga e il contesto verrà riassunto più volte: quel file è ciò che ti permette di riprendere senza perdere il filo. Rileggilo ogni volta che non sei sicuro di dove sei arrivato.
- Semplicità prima di tutto: la soluzione più semplice che soddisfa il PRD, nessuna astrazione oltre a quelle chieste qui, nessun framework multi-agent.

## Regole del workspace già decise

Le istruzioni del workspace prevedono che tu chieda se staccare un worktree: la risposta è no, lavora direttamente in questa cartella. La repo è vuota e sul branch `master`: rinominalo in `main` prima del primo commit. Le stesse istruzioni dicono che i servizi li avvio io: per questa sessione ti autorizzo ad avviare e fermare da solo il server di sviluppo dell'interfaccia per lo smoke test nel browser; fermalo quando hai finito la verifica. Per i commit segui `CODE-RULES.md` (una riga, `tipo(scope): descrizione`, in italiano, nessuna attribuzione AI). Non c'è un remote: non fare push e non crearne uno.

## Quando hai finito

Il lavoro è finito quando tutto il perimetro MVP è implementato, i test passano e non resta nulla di lasciato a metà senza che sia scritto. Non fermarti prima per chiedere conferme o proporre i passi successivi: se una strada è chiusa, prendine un'altra e annotalo.

Chiudi con `docs/RESOCONTO.md`, scritto per chi non ha seguito la sessione, diviso in tre parti nette:

1. **Verificato**: cosa funziona, con il comando che lo dimostra e il suo esito.
2. **Scritto ma non verificato**: tutto ciò che dipende dal telefono o da modelli reali, con cosa potrebbe andare storto.
3. **Non fatto**: cosa manca rispetto al PRD e perché.

Aggiungi una checklist di prova sul Pixel che ricalchi i POC A-D della sezione 16, con i passi concreti per installare l'app, caricare i modelli e raccogliere le misure, e un `README.md` con le istruzioni di avvio. Se qualcosa non funziona o non sei riuscito a provarlo, scrivilo chiaramente: un resoconto che dichiara tutto riuscito senza prove mi è meno utile di uno che elenca i buchi.
