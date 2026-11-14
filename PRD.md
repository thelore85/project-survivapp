# PRD --- Assistente offline per botanica e survival

**Stato:** Draft v0.2\
**Data:** 14 novembre 2026\
**Piattaforma iniziale:** Android\
**Dispositivo di riferimento per il prototipo:** Google Pixel 9 Pro XL,
16 GB RAM, 512 GB\
**Approccio:** applicazione mobile offline-first, con inferenza AI
on-device

------------------------------------------------------------------------

## 1. Sintesi

L'applicazione è un assistente personale utilizzabile senza connessione
Internet, progettato attorno a due aree di conoscenza:

1.  **Botanica:** analisi di fotografie di piante e funghi, ricerca di
    specie candidate e consultazione di un catalogo botanico locale.
2.  **Survival:** consultazione conversazionale di documentazione
    tecnica precaricata, con retrieval delle fonti e risposte
    contestualizzate.

Una chat principale costituisce il punto di accesso. Un orchestratore
individua il dominio della richiesta e instrada il lavoro verso il
modulo specialistico appropriato.

L'applicazione deve funzionare localmente: modelli, database, documenti,
indici e cronologia sono conservati sul dispositivo. Nessuna richiesta a
servizi cloud è necessaria per le funzionalità core.

Il sistema è uno strumento informativo e di supporto. Non deve
presentare identificazioni botaniche come certe né sostituire
valutazioni professionali, in particolare per commestibilità dei funghi,
tossicità, potabilità dell'acqua o procedure di emergenza.

## 2. Problema e opportunità

In contesti outdoor o con connettività assente, l'utente può avere
bisogno di:

-   identificare una pianta o un fungo a partire da una fotografia;
-   confrontare una specie con organismi visivamente simili;
-   consultare informazioni botaniche e caratteristiche distintive;
-   interrogare manuali e documentazione survival senza cercare
    manualmente nei PDF;
-   ottenere risposte con riferimenti alle fonti locali;
-   mantenere disponibili conoscenze e strumenti anche offline.

Le soluzioni basate esclusivamente su chatbot generici non garantiscono
accesso offline, retrieval verificabile o specializzazione sufficiente
nel riconoscimento biologico.

## 3. Obiettivi

### 3.1 Obiettivi di prodotto

-   Fornire una chat unica per le richieste botaniche e survival.
-   Eseguire elaborazione AI e retrieval sul dispositivo.
-   Identificare e presentare specie candidate da fotografie, senza
    dichiarazioni di certezza ingiustificate.
-   Rispondere a domande survival utilizzando documentazione locale.
-   Mostrare le fonti utilizzate e distinguere informazioni documentate
    da inferenze del modello.
-   Consentire l'aggiornamento offline del catalogo e dei pacchetti
    documentali tramite importazione locale.
-   Adattare i modelli e le funzionalità alle risorse hardware
    disponibili.

### 3.2 Non-obiettivi della prima versione

-   Diagnosi medica, veterinaria o tossicologica.
-   Certificazione della commestibilità di piante o funghi.
-   Navigazione cartografica avanzata o tracciamento GPS continuo.
-   Previsioni meteo, mappe online o consultazione di fonti Internet.
-   Sincronizzazione cloud, account, collaborazione multiutente.
-   Addestramento o fine-tuning dei modelli sul dispositivo.
-   Agente autonomo con pianificazione complessa o esecuzione di azioni
    esterne.
-   Supporto garantito a ogni dispositivo Android o iOS.

## 4. Utenti e scenari principali

### 4.1 Utente outdoor

Si trova in un'area senza rete e vuole consultare informazioni su una
pianta o un fungo fotografato.

### 4.2 Utente che consulta manuali

Vuole porre domande in linguaggio naturale su tecniche, materiali,
procedure e principi descritti nei documenti precaricati.

### 4.3 Utente con richiesta mista

Dopo aver identificato una specie, vuole approfondire caratteristiche,
habitat o informazioni presenti nel catalogo. L'orchestratore deve
mantenere il contesto della conversazione e passarlo al modulo corretto.

## 5. Esperienza utente e flussi

### 5.1 Chat principale

La chat è l'interfaccia primaria. Deve supportare:

-   testo;
-   acquisizione di fotografie dalla fotocamera;
-   selezione di immagini dalla galleria;
-   risposte con fonti e schede;
-   richieste di chiarimento;
-   continuità del contesto nella sessione.

La UI deve rendere evidente quando una risposta deriva da una ricerca
nel catalogo, da documenti o da una valutazione generativa.

Stile: UX moderna, ispirata alle interfacce conversazionali tipo GPT
per la chat e alle app gestionali per schede, elenchi e impostazioni.

Lingue: interfaccia e risposte in italiano, inglese e spagnolo.

### 5.2 Flusso botanico

1.  L'utente scatta o seleziona una fotografia.
2.  L'app verifica che l'immagine sia leggibile e, se necessario, chiede
    un'altra foto.
3.  Il modello visivo estrae caratteristiche o genera una
    rappresentazione vettoriale.
4.  Il sistema recupera specie candidate dal catalogo locale.
5.  Il modulo di identificazione confronta i candidati e le relative
    caratteristiche.
6.  Il modello linguistico produce una risposta strutturata con:
    -   candidati ordinati;
    -   nome comune e scientifico, se disponibili;
    -   caratteristiche compatibili;
    -   caratteristiche non verificabili o discordanti;
    -   specie simili da non confondere;
    -   ulteriori fotografie o dettagli richiesti;
    -   fonti del catalogo.
7.  L'app mostra un avviso di incertezza e le limitazioni
    dell'identificazione.

Il sistema non deve concludere che una specie sia commestibile o sicura
sulla sola base di una fotografia.

### 5.3 Flusso survival

1.  L'utente formula una domanda.
2.  L'orchestratore instrada la richiesta al dominio survival.
3.  Il sistema recupera passaggi pertinenti dai documenti locali tramite
    ricerca full-text e semantica.
4.  Il modello genera una risposta usando il contesto recuperato.
5.  L'app mostra i riferimenti ai documenti e, ove disponibili, pagina o
    sezione.
6.  Se le fonti non sono sufficienti o sono in conflitto, il sistema lo
    dichiara e non inventa una procedura.

### 5.4 Flusso misto

L'orchestratore può invocare più di un modulo quando la richiesta lo
richiede. Per l'MVP, la composizione deve essere sequenziale e limitata:
evitare catene autonome e non controllate di agenti.

### 5.5 Impostazioni

Schermata di configurazione dentro l'app, senza account né ruoli.
Consente di:

-   scegliere la lingua;
-   vedere il pacchetto base installato e la sua versione;
-   gestire i file caricati dall'utente e lo spazio occupato;
-   modificare la quota di memoria dedicata ai file utente;
-   vedere lo stato dei modelli e la diagnostica delle risorse;
-   cancellare cronologia e cache.

I valori di partenza arrivano dal file di configurazione del pacchetto
base (sezione 11.3).

## 6. Architettura funzionale

### 6.1 Principi

-   Monorepo TypeScript.
-   React Native per UI e applicazione mobile, con Expo per poter
    aprire l'interfaccia anche nel browser durante lo sviluppo.
-   NativeWind per lo stile (classi Tailwind in React Native).
-   React Native Reusables per i componenti (equivalente di shadcn/ui;
    shadcn e Radix non funzionano in React Native perché dipendono dal
    DOM).
-   Zustand per lo stato dell'interfaccia.
-   Logica applicativa eseguita nello stesso processo dell'app.
-   Chiamate dirette tra moduli; nessun backend HTTP locale necessario.
-   Moduli nativi per le parti di inferenza che richiedono librerie
    C/C++ o accelerazione hardware.
-   SQLite come persistenza primaria.
-   Architettura offline-first.
-   Modelli sostituibili senza riscrivere i domini applicativi.

### 6.2 Componenti

**Mobile UI** - chat; - acquisizione immagini; - visualizzazione schede
specie; - visualizzazione fonti; - gestione cataloghi, documenti e
modelli; - diagnostica delle risorse.

**Application layer TypeScript** - orchestratore/router; - gestione
conversazioni e contesto; - agenti specialistici come servizi
applicativi; - pipeline RAG; - gestione importazioni e indicizzazione; -
policy di sicurezza e validazione output.

**AI runtime** - runtime LLM locale; - runtime vision
encoder/classifier; - runtime embedding testuale; - eventuale runtime
embedding visivo; - bridge nativo Android.

**Persistence** - SQLite; - FTS5; - indice vettoriale locale, mediante
estensione o implementazione compatibile verificata; - file system
privato dell'app per modelli, immagini e documenti importati.

### 6.3 Schema logico

``` text
React Native UI
      |
Application layer (TypeScript)
      |
      +-- Conversation manager
      +-- Orchestrator / router
      +-- Botanical module
      |      +-- Image preprocessing
      |      +-- Vision model
      |      +-- Visual retrieval
      |      +-- Species catalogue
      |
      +-- Survival module
      |      +-- Document ingestion
      |      +-- Full-text retrieval
      |      +-- Semantic retrieval
      |      +-- Source-grounded answer
      |
      +-- Model manager
      +-- Safety policies
      |
Native inference bridge
      |
      +-- LLM runtime
      +-- Vision runtime
      +-- Embedding runtime
      |
SQLite + local files
```

## 7. Modelli AI candidati

I modelli indicati sono ipotesi da verificare con prove tecniche sul
dispositivo target. La selezione definitiva dipende da licenza,
dimensione, formato, supporto Android, qualità e prestazioni reali.

### 7.1 Modello linguistico

**Candidato iniziale: Gemma 3n E2B**

Ruoli: - generazione delle risposte; - spiegazione dei risultati
botanici; - conversazione sul contesto recuperato; - eventuale
comprensione multimodale delle immagini; - supporto al routing solo nei
casi ambigui.

Non è necessario utilizzare un LLM separato per ogni agente. Un unico
modello può essere condiviso dai due domini, con prompt, strumenti e
contesti distinti.

Da verificare: - compatibilità del runtime con Tensor G4; - memoria
effettivamente disponibile; - latenza di prefill e generazione; -
gestione del contesto; - consumo energetico e thermal throttling; -
qualità in italiano e spagnolo.

### 7.2 Visione botanica

**Candidato iniziale: BioCLIP 2**

Ruolo: - estrazione di embedding visivi; - confronto con immagini del
catalogo; - recupero di specie o gruppi tassonomici visivamente simili.

BioCLIP 2 non va considerato automaticamente un classificatore
universale pronto all'uso. È necessario verificare: - formato e licenza
dei pesi; - possibilità di conversione e inferenza Android; -
accuratezza su fotografie reali, non soltanto benchmark; - prestazioni
su immagini di piante e funghi; - robustezza a sfondo, illuminazione,
stadio di crescita e qualità fotografica.

Possibili alternative da valutare: modelli specialistici di
classificazione botanica/fungina e modelli visivi più piccoli. Il
sistema deve poter sostituire il modello senza cambiare l'interfaccia
del modulo botanico.

### 7.3 Embedding testuali

**Candidato iniziale: EmbeddingGemma**

Ruolo: - embedding delle sezioni documentali; - embedding delle schede
botaniche testuali; - retrieval semantico multilingua.

Gli embedding visivi e testuali devono essere trattati come spazi
distinti, a meno che il modello scelto non supporti esplicitamente uno
spazio multimodale condiviso.

### 7.4 Orchestratore

Per l'MVP l'orchestratore è principalmente codice TypeScript
deterministico: - classificazione delle intenzioni tramite regole e
segnali espliciti; - invocazione dei moduli; - gestione del contesto; -
controllo dei risultati; - fallback e richiesta di chiarimenti.

L'LLM può essere utilizzato per classificare richieste ambigue o
produrre una risposta integrata, ma non deve decidere liberamente quali
operazioni eseguire senza limiti.

## 8. RAG botanico

### 8.1 Dati

Ogni scheda specie dovrebbe poter contenere: - identificativo stabile; -
nome scientifico; - nomi comuni e lingue; - famiglia e tassonomia; -
descrizione morfologica; - habitat e distribuzione; - stagionalità; -
caratteristiche di foglie, fiori, frutti, cappello, gambo e lamelle,
secondo il tipo di organismo; - specie simili; - rischi e avvertenze; -
fonti bibliografiche; - immagini autorizzate e relativi metadati.

### 8.2 Retrieval

La ricerca botanica deve combinare, dove disponibile: - similarità degli
embedding visivi; - filtri tassonomici; - metadati geografici e
stagionali, se forniti dall'utente; - ricerca testuale sulle
caratteristiche; - confronto delle caratteristiche distintive.

La similarità visiva non equivale a probabilità calibrata di
identificazione. Non mostrare percentuali di confidenza se non sono
state validate e calibrate.

### 8.3 Output

La risposta deve separare: - risultato del retrieval; - valutazione del
modello; - elementi osservati; - elementi non osservabili nella foto; -
alternative plausibili; - informazioni mancanti.

### 8.4 Perimetro del catalogo

-   Territorio: Spagna, Italia, Europa centrale.
-   Dimensione iniziale: circa 300 specie.
-   Criterio di selezione: le specie più comuni dell'area, più tutte le
    specie tossiche rilevanti e i loro sosia.
-   Fonti: dati aperti e attuali con licenza che consente la
    distribuzione offline (ad esempio GBIF, Wikipedia, fotografie
    iNaturalist con licenza libera). Fonte e licenza vanno registrate
    per ogni scheda e per ogni immagine.
-   I testi storici in `knowledge_base/botany` non sono una fonte per
    le schede: tassonomia e giudizi di commestibilità sono superati.

## 9. RAG survival

### 9.1 Fonti

La prima versione supporta documentazione precaricata/importata
localmente, ad esempio PDF e file testuali. I formati definitivi
dipendono dalle librerie di parsing selezionate.

Corpus iniziale: i PDF in `knowledge_base/`, in inglese, con fonti,
diritti e limiti elencati in `knowledge_base/SOURCES.md`.

Poiché i documenti sono in inglese e le domande possono arrivare in
italiano o spagnolo, la ricerca full-text da sola non basta: il
retrieval semantico multilingua è obbligatorio, non opzionale.

Ogni documento deve conservare: - titolo; - autore o ente; -
edizione/data, se disponibile; - lingua; - fonte; - identificativo; -
pagine e sezioni; - data di importazione; - stato di indicizzazione.

### 9.2 Indicizzazione

Pipeline: 1. importazione; 2. estrazione testo; 3. suddivisione in chunk
con metadati; 4. indicizzazione FTS5; 5. calcolo embedding; 6.
memorizzazione degli indici; 7. verifica e report di importazione.

### 9.3 Risposte

-   Rispondere usando prioritariamente i passaggi recuperati.
-   Citare documento, pagina o sezione quando disponibili.
-   Segnalare fonti discordanti.
-   Dichiarare quando il catalogo non contiene informazioni sufficienti.
-   Non inventare citazioni, procedure, dosaggi o valori.
-   Per argomenti ad alto rischio, applicare policy conservative e
    avvisi espliciti.

## 10. Orchestrazione e gestione del contesto

### 10.1 Domini

-   `botanical`
-   `survival`
-   `general`
-   `mixed`
-   `clarification_required`

### 10.2 Responsabilità dell'orchestratore

-   classificare l'intento;
-   identificare gli input richiesti, ad esempio immagine o testo;
-   invocare il modulo specialistico;
-   passare il contesto conversazionale necessario;
-   mantenere la provenienza dei risultati;
-   comporre una risposta coerente;
-   impedire che contenuti recuperati vengano interpretati come
    istruzioni operative per l'agente.

### 10.3 Memoria

Per l'MVP: - cronologia conversazioni locale; - stato della sessione; -
riferimenti a immagini e risultati precedenti; - contesto esplicito e
limitato.

Non implementare inizialmente una memoria autonoma complessa. I dati
persistenti devono essere visibili, gestibili e cancellabili
dall'utente.

## 11. Persistenza e gestione file

### 11.1 Database

**SQLite** come database embedded principale.

Componenti: - tabelle relazionali per conversazioni, documenti, specie e
metadati; - FTS5 per ricerca full-text; - indice vettoriale locale,
tramite estensione compatibile o soluzione verificata; - versionamento
dello schema e migrazioni.

### 11.2 File locali

Conservare nella directory privata dell'app: - pesi dei modelli; -
documenti importati; - immagini e miniature; - eventuali cache e indici
ricostruibili.

Prevedere gestione dello spazio: - dimensione dei modelli; - spazio
occupato dai documenti; - cache eliminabili; - cancellazione selettiva
dei pacchetti.

### 11.3 Pacchetto base, file utente e configurazione

**Pacchetto base**

-   Preparato dal proprietario del prodotto, non modificabile
    dall'utente.
-   Contiene modelli, catalogo botanico, documenti survival, indici e
    un file di configurazione.
-   Per le dimensioni dei modelli (alcuni GB) viene copiato sul
    telefono separatamente dall'app installabile.
-   Si aggiorna sostituendolo con una versione più recente, tramite
    file trasferito localmente.

**File dell'utente**

-   Formati ammessi: PDF e testo.
-   Dimensione massima per file: 100 MB.
-   Nessun limite sul numero di file.
-   Quota totale di memoria dedicata: 200 MB di default, modificabile
    dalle impostazioni.
-   Un'importazione che supera un limite viene rifiutata con un
    messaggio che spiega quale.

**Configurazione a livelli**

-   Il file di configurazione del pacchetto fornisce i valori di
    default.
-   Le impostazioni scelte dall'utente li sovrascrivono e sono salvate
    nel database locale.
-   Le policy di sicurezza della sezione 13 non sono configurabili da
    nessuno dei due livelli.

## 12. Requisiti non funzionali

### 12.1 Offline e privacy

-   Le funzionalità core devono funzionare in modalità aereo dopo
    l'installazione e il caricamento dei pacchetti.
-   Nessuna immagine o conversazione deve essere inviata a servizi
    remoti.
-   Eventuali telemetria, analytics o aggiornamenti online devono essere
    assenti nell'MVP o esplicitamente opt-in.
-   I permessi per fotocamera e file devono essere richiesti solo quando
    necessari.

### 12.2 Prestazioni

I valori definitivi saranno fissati dopo i benchmark. Obiettivi iniziali
sul dispositivo di riferimento: - apertura chat senza caricamento di
modelli non necessari; - retrieval testuale locale percepito come
immediato; - elaborazione di una fotografia con feedback di
avanzamento; - generazione conversazionale sufficientemente fluida per
risposte brevi; - nessun blocco dell'interfaccia durante inferenza o
indicizzazione.

Misurare separatamente: - tempo di caricamento modello; - memoria
massima e media; - latenza vision; - latenza embedding e retrieval; -
token al secondo; - temperatura e throttling; - consumo batteria; -
dimensione totale dei dati.

### 12.3 Compatibilità

Il primo target è Android su Pixel 9 Pro XL. Non assumere che le stesse
prestazioni siano disponibili su altri dispositivi con pari RAM.

L'app deve prevedere un controllo iniziale delle capacità: - RAM e
memoria disponibile; - supporto runtime; - acceleratori utilizzabili; -
spazio libero; - modello compatibile.

In base al risultato, selezionare un profilo di esecuzione o
disabilitare funzionalità non supportate.

### 12.4 Ambiente di sviluppo e smoke test

-   Il dispositivo di riferimento non è ancora disponibile e sul PC di
    sviluppo non è installata la toolchain Android: verrà installata
    quando il codice sarà a un punto utile per un test su telefono.
-   Fino ad allora lo smoke test si fa sul PC: logica applicativa
    testata in Node, interfaccia aperta nel browser.
-   Per questo ogni runtime AI ha anche un'implementazione finta e
    deterministica, selezionabile in una modalità demo.

## 13. Sicurezza e limiti d'uso

### 13.1 Botanica e funghi

-   Nessuna identificazione fotografica deve essere presentata come
    certezza.
-   Non fornire un via libera al consumo di funghi o piante.
-   Non dedurre commestibilità dalla somiglianza visiva.
-   Evidenziare specie simili e possibili confusioni.
-   In caso di dubbio, dichiarare che l'identificazione non è
    affidabile.
-   Suggerire verifica da parte di un esperto qualificato per decisioni
    che comportano ingestione o contatto.

### 13.2 Survival

-   Le risposte su acqua, fuoco, ripari, primo soccorso e situazioni di
    emergenza devono essere basate su fonti attendibili.
-   Distinguere indicazioni generali da istruzioni che dipendono da
    contesto, ambiente o condizioni personali.
-   Non inventare dosaggi o procedure.
-   Per emergenze reali, indicare di contattare i servizi di emergenza
    quando possibile.
-   Le procedure di primo soccorso devono essere trattate come contenuto
    ad alto rischio e sottoposte a revisione specifica.

### 13.3 Prompt injection nei documenti

I documenti importati sono dati, non istruzioni per l'agente. Il sistema
deve: - delimitare il contesto recuperato; - non eseguire istruzioni
contenute nei documenti; - applicare policy e controlli definiti
dall'applicazione; - conservare la provenienza di ogni passaggio citato.

## 14. MVP: perimetro proposto

### Incluso

-   App Android React Native.
-   Chat principale.
-   Orchestratore TypeScript semplice.
-   Un LLM locale condiviso.
-   RAG survival su documenti importati.
-   Catalogo botanico locale iniziale.
-   Analisi fotografica con un modello visivo.
-   Retrieval visivo e testuale dei candidati.
-   SQLite, FTS5 e indice vettoriale.
-   Gestione modelli e pacchetti locali.
-   Schermata impostazioni e configurazione a livelli.
-   Importazione di file utente entro i limiti definiti.
-   Interfaccia in italiano, inglese e spagnolo.
-   Modalità demo con modelli finti per lo smoke test su PC.
-   Funzionamento offline.
-   Avvisi di sicurezza e fonti nelle risposte.

### Escluso

-   Multi-agent framework complesso.
-   Agenti autonomi con pianificazione libera.
-   Sincronizzazione cloud.
-   Account e backend remoto.
-   Addestramento on-device.
-   Supporto iOS nella prima iterazione.
-   Identificazione certificata o giudizio di commestibilità.
-   Catalogo esaustivo di tutte le specie.

## 15. Criteri di accettazione

### Applicazione

-   L'app si avvia e consente di usare le funzioni core in modalità
    aereo.
-   La chat conserva la cronologia localmente.
-   L'utente può importare e rimuovere i propri file; il pacchetto
    base non è modificabile.
-   Un file oltre 100 MB, di formato non ammesso o che supera la quota
    viene rifiutato con un messaggio esplicito.
-   La quota modificata dalle impostazioni resta valida al riavvio.
-   L'interfaccia rimane reattiva durante l'inferenza.

### Survival RAG

-   Una domanda trova passaggi pertinenti nel corpus di test.
-   La risposta mostra riferimenti verificabili a documento e
    pagina/sezione.
-   Se non ci sono fonti sufficienti, il sistema dichiara il limite.
-   Nessuna citazione viene generata senza un riferimento recuperato.

### Botanica

-   Una fotografia avvia la pipeline visiva.
-   Il sistema restituisce una lista di candidati, non una certezza
    assoluta.
-   I candidati sono collegati a schede locali.
-   Il sistema espone limiti e alternative.
-   Non dichiara commestibilità o sicurezza sulla base della foto.

### Orchestrazione

-   Le richieste botaniche e survival vengono instradate correttamente
    nel set di test.
-   Le richieste ambigue generano una domanda di chiarimento.
-   Il contesto precedente viene passato al modulo specialistico quando
    pertinente.
-   I moduli possono essere testati indipendentemente.

## 16. Piano di validazione tecnica

I proof of concept richiedono il dispositivo, che non è ancora
disponibile: lo sviluppo parte dal codice (sezione 12.4) e i POC si
eseguono appena il telefono c'è. Fino ad allora la scelta dei modelli
resta un'ipotesi e l'architettura deve permettere di sostituirli.

### POC A --- LLM Android

-   Eseguire Gemma 3n E2B sul Pixel 9 Pro XL.
-   Misurare memoria, caricamento, token/s, temperatura e batteria.
-   Verificare qualità in italiano e spagnolo.
-   Provare conversazioni con contesto RAG.

### POC B --- Visione botanica

-   Verificare BioCLIP 2 in un runtime compatibile Android.
-   Preparare un dataset di fotografie reali con etichette verificate.
-   Misurare top-1 e top-k, latenza e memoria.
-   Separare i risultati per piante e funghi.
-   Testare immagini difficili: sfondi complessi, luce variabile,
    soggetti parziali e stadi di crescita diversi.

### POC C --- Retrieval survival

-   Preparare un corpus piccolo ma rappresentativo.
-   Confrontare FTS5, embedding semantici e retrieval ibrido.
-   Valutare precisione dei passaggi recuperati.
-   Verificare la correttezza delle citazioni.

### POC D --- Architettura applicativa

-   Verificare bridge nativo e gestione dei modelli.
-   Verificare SQLite, FTS5 e soluzione vettoriale su Android.
-   Testare importazione, cancellazione e ricostruzione degli indici.
-   Verificare comportamento in caso di memoria insufficiente.

## 17. Metriche di successo

-   Accuratezza del routing tra domini.
-   Precision@k del retrieval documentale.
-   Tasso di risposte survival supportate da fonti.
-   Top-k accuracy del retrieval botanico sul dataset di test.
-   Percentuale di risposte che dichiarano correttamente incertezza o
    insufficienza di dati.
-   Tempo medio di risposta per ciascuna fase.
-   Memoria massima e consumo energetico.
-   Percentuale di funzionalità core disponibili offline.

Le soglie numeriche devono essere definite dopo la costruzione dei
dataset di valutazione e i primi benchmark hardware.

## 18. Rischi e dipendenze

  -----------------------------------------------------------------------
  Rischio                 Impatto                 Mitigazione
  ----------------------- ----------------------- -----------------------
  Modello vision non      Alto                    POC su Tensor G4 prima
  ottimizzato per Android                         di fissare il modello

  RAM insufficiente con   Alto                    Caricamento on-demand e
  modelli simultanei                              rilascio esplicito dei
                                                  modelli

  Identificazione         Molto alto              Top-k, incertezza,
  botanica errata                                 fonti e nessuna
                                                  dichiarazione di
                                                  commestibilità

  Corpus survival         Alto                    Provenienza, revisione
  incompleto o non                                e qualità delle fonti
  affidabile                                      

  Latenza elevata         Medio/alto              Quantizzazione, modelli
                                                  più piccoli,
                                                  accelerazione hardware

  Crescita dello storage  Medio                   Gestione pacchetti,
                                                  cache e cancellazione
                                                  selettiva

  Incompatibilità tra     Alto                    Astrazione del runtime
  runtime e SoC                                   e test su dispositivi
                                                  reali
  -----------------------------------------------------------------------

## 19. Decisioni

### Prese

1.  Territorio del catalogo: Spagna, Italia, Europa centrale (8.4).
2.  Specie: circa 300, le più comuni più tossiche e sosia (8.4).
3.  Manuali survival: i PDF di pubblico dominio in `knowledge_base/`.
4.  Importazione: pacchetto base non modificabile, più file
    dell'utente entro i limiti (11.3).
5.  Aggiornamento dei cataloghi: sì, sostituendo il pacchetto base con
    un file trasferito localmente (11.3).
6.  Lingue: italiano, inglese, spagnolo.
7.  Modelli: distribuiti dentro il pacchetto base, non scaricati dalla
    rete.

### Ancora aperte

1.  Elenco puntuale delle specie e licenza di ogni fonte botanica: il
    criterio è fissato, la lista va costruita e verificata.
2.  Il riconoscimento botanico userà solo embedding visivi oppure anche
    un classificatore dedicato?
3.  Il modello multimodale sarà condiviso con il modello conversazionale
    o verrà usato solo per analisi immagini?
4.  Quali versioni minime di Android e quali dispositivi saranno
    supportati?

## 20. Raccomandazione tecnica conclusiva

Non implementare subito un sistema multi-agent. Costruire prima due
pipeline specialistiche indipendenti e un orchestratore TypeScript
semplice.

La prima milestone deve dimostrare che i modelli scelti funzionano
davvero sul Pixel 9 Pro XL, con prestazioni accettabili e senza esaurire
la memoria.

La combinazione iniziale da testare è:

-   **LLM:** Gemma 3n E2B.
-   **Visione botanica:** BioCLIP 2.
-   **Embedding testuali:** EmbeddingGemma.
-   **Persistenza:** SQLite + FTS5 + indice vettoriale locale.
-   **Applicazione:** React Native + TypeScript.
-   **Inferenza:** runtime Android locale tramite bridge nativo.

Queste sono scelte candidate, non dipendenze definitive: ogni modello
deve superare una prova di compatibilità, licenza, qualità e prestazioni
prima di essere adottato.
