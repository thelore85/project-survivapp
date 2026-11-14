# Stato dei lavori

Aggiornato a ogni tappa. Serve a riprendere dopo un'interruzione.

## Fatto

- Struttura del monorepo, TypeScript, Vitest, ESLint.
- `packages/core`: database e migrazioni, chunking, archivio documenti, ricerca ibrida, policy di sicurezza, modulo survival, modulo botanico, orchestratore, cronologia, configurazione a livelli, file utente, gestione modelli, manifest del pacchetto, modelli finti.
- Test del core: 149, tutti verdi (`npm run test -w @survivapp/core`).

## In corso

- Catalogo delle specie: script in `tools/catalogue/`, dati in `data/catalogue/` (affidato a un agente in parallelo).

## Da fare, in ordine

1. `tools/package-builder`: estrae il testo dai PDF di `knowledge_base/`, costruisce `content.db`, il manifest e il pacchetto demo.
2. `apps/mobile`: app Expo (SDK 57) con NativeWind, chat, schede specie, fonti, impostazioni, file utente, modalità demo nel browser.
3. Adapter reali non verificabili: runtime dei modelli su Android, SQLite nativo.
4. Smoke test nel browser.
5. `README.md`, `docs/RESOCONTO.md`, checklist di prova sul Pixel.
