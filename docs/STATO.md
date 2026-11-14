# Stato dei lavori

Aggiornato a ogni tappa. Serve a riprendere dopo un'interruzione.

## Fatto

- Struttura del monorepo, TypeScript, Vitest, ESLint.
- `packages/core`: database e migrazioni, chunking, archivio documenti, ricerca ibrida, policy di sicurezza, modulo survival, modulo botanico, orchestratore, cronologia, configurazione a livelli, file utente, gestione modelli, manifest del pacchetto, modelli finti.
- `tools/package-builder`: pacchetto base dai PDF e dal catalogo.
- `tools/catalogue` e `data/catalogue`: 325 specie da fonti aperte.
- `apps/mobile`: app Expo con chat, cronologia, libreria, impostazioni, scheda specie; piattaforma browser verificata, piattaforma Android scritta e non verificata.
- Smoke test nel browser: 10 passi verdi.
- Documentazione: `README.md`, `docs/DECISIONI.md`, `docs/RESOCONTO.md`, `docs/CHECKLIST-PIXEL.md`.

## In corso

- Nulla.

## Prossimi passi

1. Installare Android Studio e seguire `docs/CHECKLIST-PIXEL.md` dalla sezione 0.
2. Far rivedere il catalogo a un esperto.
3. Decidere i punti aperti elencati in `docs/RESOCONTO.md`, sezione 4.
