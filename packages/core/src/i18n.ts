import type { Lang } from './types';

const MESSAGES = {
  'notice.identification_uncertain': {
    it: "Un'identificazione da fotografia non è mai certa: sono specie candidate, non una conferma.",
    en: 'An identification from a photograph is never certain: these are candidate species, not a confirmation.',
    es: 'Una identificación a partir de una fotografía nunca es segura: son especies candidatas, no una confirmación.',
  },
  'notice.no_consumption': {
    it: 'Non usare questa app per decidere se mangiare o toccare una pianta o un fungo. Fai verificare da un esperto qualificato.',
    en: 'Do not use this app to decide whether to eat or touch a plant or mushroom. Have it checked by a qualified expert.',
    es: 'No uses esta app para decidir si comer o tocar una planta o una seta. Haz que la verifique un experto cualificado.',
  },
  'notice.similarity_not_probability': {
    it: "L'ordine dei candidati indica somiglianza visiva, non una probabilità di identificazione.",
    en: 'The order of the candidates reflects visual similarity, not a probability of identification.',
    es: 'El orden de los candidatos indica similitud visual, no una probabilidad de identificación.',
  },
  'notice.dangerous_candidates': {
    it: 'Attenzione: tra i candidati o tra le specie simili ce ne sono di tossiche o mortali.',
    en: 'Warning: the candidates or their look-alikes include toxic or deadly species.',
    es: 'Atención: entre los candidatos o las especies parecidas hay especies tóxicas o mortales.',
  },
  'notice.no_warning_not_safe': {
    it: "L'assenza di avvertenze nella scheda non significa che la specie sia sicura.",
    en: 'The absence of warnings on a card does not mean the species is safe.',
    es: 'La ausencia de advertencias en la ficha no significa que la especie sea segura.',
  },
  'notice.emergency': {
    it: "In un'emergenza reale contatta i servizi di emergenza appena possibile (112 in Europa).",
    en: 'In a real emergency contact the emergency services as soon as possible (112 in Europe).',
    es: 'En una emergencia real contacta con los servicios de emergencia lo antes posible (112 en Europa).',
  },
  'notice.first_aid': {
    it: 'Il primo soccorso è un contenuto ad alto rischio: queste informazioni non sostituiscono un professionista sanitario.',
    en: 'First aid is high-risk content: this information does not replace a health professional.',
    es: 'Los primeros auxilios son contenido de alto riesgo: esta información no sustituye a un profesional sanitario.',
  },
  'notice.water': {
    it: "La potabilità dell'acqua dipende dal contesto: nessun metodo garantisce acqua sicura in ogni situazione.",
    en: 'Whether water is safe to drink depends on context: no method guarantees safe water in every situation.',
    es: 'La potabilidad del agua depende del contexto: ningún método garantiza agua segura en todas las situaciones.',
  },
  'notice.context_dependent': {
    it: 'Sono indicazioni generali: la procedura corretta dipende da ambiente, materiali e condizioni personali.',
    en: 'These are general indications: the right procedure depends on environment, materials and personal conditions.',
    es: 'Son indicaciones generales: el procedimiento correcto depende del entorno, los materiales y las condiciones personales.',
  },
  'notice.historical_source': {
    it: 'Alcune fonti sono testi storici: classificazione e giudizi di commestibilità possono essere superati.',
    en: 'Some sources are historical texts: their classification and edibility judgements may be outdated.',
    es: 'Algunas fuentes son textos históricos: su clasificación y sus juicios de comestibilidad pueden estar superados.',
  },
  'notice.conflicting_sources': {
    it: 'Le fonti trovate non concordano tra loro: confronta i passaggi citati.',
    en: 'The sources found do not agree with each other: compare the cited passages.',
    es: 'Las fuentes encontradas no concuerdan entre sí: compara los pasajes citados.',
  },
  'notice.generated_removed': {
    it: 'La spiegazione generata è stata scartata dai controlli di sicurezza: restano solo dati di catalogo e fonti.',
    en: 'The generated explanation was discarded by the safety checks: only catalogue data and sources remain.',
    es: 'La explicación generada fue descartada por los controles de seguridad: solo quedan datos de catálogo y fuentes.',
  },
  'notice.semantic_unavailable': {
    it: 'Ricerca semantica non disponibile: risultati solo per parole.',
    en: 'Semantic search unavailable: keyword results only.',
    es: 'Búsqueda semántica no disponible: resultados solo por palabras.',
  },
  'survival.insufficient': {
    it: 'I documenti locali non contengono informazioni sufficienti per rispondere. Non invento una procedura.',
    en: 'The local documents do not contain enough information to answer. I will not make up a procedure.',
    es: 'Los documentos locales no contienen información suficiente para responder. No voy a inventar un procedimiento.',
  },
  'survival.extractive_intro': {
    it: 'Passaggi trovati nei documenti locali:',
    en: 'Passages found in the local documents:',
    es: 'Pasajes encontrados en los documentos locales:',
  },
  'botany.retake': {
    it: 'La foto non è abbastanza leggibile per un confronto. Scattane un’altra.',
    en: 'The photo is not readable enough for a comparison. Please take another one.',
    es: 'La foto no es lo bastante legible para una comparación. Haz otra.',
  },
  'botany.no_candidates': {
    it: 'Nessuna specie del catalogo locale assomiglia abbastanza alla foto.',
    en: 'No species in the local catalogue is similar enough to the photo.',
    es: 'Ninguna especie del catálogo local se parece lo suficiente a la foto.',
  },
  'botany.unavailable': {
    it: 'Il confronto visivo non è disponibile: manca il modello di visione o il catalogo non è compatibile.',
    en: 'Visual comparison is unavailable: the vision model is missing or the catalogue is not compatible.',
    es: 'La comparación visual no está disponible: falta el modelo de visión o el catálogo no es compatible.',
  },
  'botany.candidates_intro': {
    it: 'Specie candidate dal catalogo locale, in ordine di somiglianza visiva:',
    en: 'Candidate species from the local catalogue, in order of visual similarity:',
    es: 'Especies candidatas del catálogo local, por orden de similitud visual:',
  },
  'botany.species_intro': {
    it: 'Schede trovate nel catalogo locale:',
    en: 'Cards found in the local catalogue:',
    es: 'Fichas encontradas en el catálogo local:',
  },
  'botany.species_not_found': {
    it: 'Nessuna scheda del catalogo locale corrisponde alla richiesta.',
    en: 'No card in the local catalogue matches the request.',
    es: 'Ninguna ficha del catálogo local corresponde a la petición.',
  },
  'botany.not_observable': {
    it: 'Il confronto usa l’aspetto complessivo della foto: le singole caratteristiche della scheda non sono state verificate.',
    en: 'The comparison uses the overall look of the photo: the individual features on the card have not been verified.',
    es: 'La comparación usa el aspecto general de la foto: las características de la ficha no se han verificado.',
  },
  'issue.too_small': { it: 'risoluzione troppo bassa', en: 'resolution too low', es: 'resolución demasiado baja' },
  'issue.too_dark': { it: 'immagine troppo scura', en: 'image too dark', es: 'imagen demasiado oscura' },
  'issue.too_bright': { it: 'immagine sovraesposta', en: 'image overexposed', es: 'imagen sobreexpuesta' },
  'issue.low_contrast': { it: 'contrasto troppo basso', en: 'contrast too low', es: 'contraste demasiado bajo' },
  'issue.blurry': { it: 'immagine sfocata', en: 'image out of focus', es: 'imagen desenfocada' },
  'detail.fungus.gills': {
    it: 'foto della parte inferiore del cappello (lamelle, pori o aculei)',
    en: 'photo of the underside of the cap (gills, pores or spines)',
    es: 'foto de la parte inferior del sombrero (láminas, poros o aguijones)',
  },
  'detail.fungus.base': {
    it: 'foto della base del gambo, estratta intera dal terreno (volva, bulbo)',
    en: 'photo of the base of the stem, lifted whole from the ground (volva, bulb)',
    es: 'foto de la base del pie, extraída entera del suelo (volva, bulbo)',
  },
  'detail.fungus.ring': {
    it: 'foto del gambo con eventuale anello',
    en: 'photo of the stem showing any ring',
    es: 'foto del pie con el posible anillo',
  },
  'detail.fungus.habitat': {
    it: 'ambiente di crescita: su legno o a terra, sotto quali alberi',
    en: 'growing environment: on wood or on the ground, under which trees',
    es: 'entorno de crecimiento: sobre madera o en el suelo, bajo qué árboles',
  },
  'detail.plant.leaf': {
    it: 'foto ravvicinata di una foglia, sopra e sotto',
    en: 'close-up photo of a leaf, upper and lower side',
    es: 'foto de cerca de una hoja, por arriba y por abajo',
  },
  'detail.plant.flower': {
    it: 'foto di fiori o frutti, se presenti',
    en: 'photo of flowers or fruits, if present',
    es: 'foto de flores o frutos, si los hay',
  },
  'detail.plant.whole': {
    it: 'foto della pianta intera, con il portamento e l’attacco delle foglie al fusto',
    en: 'photo of the whole plant, showing its habit and how leaves join the stem',
    es: 'foto de la planta entera, con su porte y la inserción de las hojas en el tallo',
  },
  'detail.plant.habitat': {
    it: 'luogo e periodo: regione, quota, tipo di terreno, mese',
    en: 'place and time: region, altitude, type of ground, month',
    es: 'lugar y época: región, altitud, tipo de terreno, mes',
  },
  'conversation.photo_title': { it: 'Foto', en: 'Photo', es: 'Foto' },
  'clarify.question': {
    it: 'Non ho capito a quale ambito ti riferisci. Vuoi informazioni su una pianta o un fungo, oppure una ricerca nei manuali di sopravvivenza?',
    en: 'I am not sure which area you mean. Do you want information about a plant or mushroom, or a search in the survival manuals?',
    es: 'No he entendido a qué ámbito te refieres. ¿Quieres información sobre una planta o una seta, o una búsqueda en los manuales de supervivencia?',
  },
  'clarify.need_image': {
    it: 'Per identificare una specie mi serve una fotografia: scattala o sceglila dalla galleria. In alternativa scrivimi il nome della specie.',
    en: 'To identify a species I need a photograph: take one or choose it from the gallery. Otherwise tell me the name of the species.',
    es: 'Para identificar una especie necesito una fotografía: hazla o elígela de la galería. Si no, dime el nombre de la especie.',
  },
  'clarify.option.botanical': { it: 'Piante e funghi', en: 'Plants and mushrooms', es: 'Plantas y setas' },
  'clarify.option.survival': { it: 'Manuali di sopravvivenza', en: 'Survival manuals', es: 'Manuales de supervivencia' },
  'general.help': {
    it: 'Posso confrontare la foto di una pianta o di un fungo con il catalogo locale e cercare risposte nei manuali di sopravvivenza salvati sul dispositivo. Funziono senza rete. Non sostituisco un esperto: non confermo identificazioni né commestibilità.',
    en: 'I can compare a photo of a plant or mushroom with the local catalogue and look for answers in the survival manuals stored on the device. I work offline. I do not replace an expert: I never confirm an identification or edibility.',
    es: 'Puedo comparar la foto de una planta o una seta con el catálogo local y buscar respuestas en los manuales de supervivencia guardados en el dispositivo. Funciono sin conexión. No sustituyo a un experto: no confirmo identificaciones ni comestibilidad.',
  },
  'userfile.format_not_allowed': {
    it: 'Formato non ammesso: si possono importare solo PDF e file di testo.',
    en: 'Format not allowed: only PDF and text files can be imported.',
    es: 'Formato no admitido: solo se pueden importar PDF y archivos de texto.',
  },
  'userfile.file_too_large': {
    it: 'File troppo grande: il limite è {limit} MB per file.',
    en: 'File too large: the limit is {limit} MB per file.',
    es: 'Archivo demasiado grande: el límite es {limit} MB por archivo.',
  },
  'userfile.quota_exceeded': {
    it: 'Spazio insufficiente: il file supera la quota di {limit} MB dedicata ai tuoi file ({used} MB già usati).',
    en: 'Not enough space: the file exceeds the {limit} MB quota for your files ({used} MB already used).',
    es: 'Espacio insuficiente: el archivo supera la cuota de {limit} MB para tus archivos ({used} MB ya usados).',
  },
  'userfile.empty_document': {
    it: 'Nel file non è stato trovato testo leggibile.',
    en: 'No readable text was found in the file.',
    es: 'No se ha encontrado texto legible en el archivo.',
  },
  'userfile.extraction_failed': {
    it: 'Non è stato possibile leggere il file.',
    en: 'The file could not be read.',
    es: 'No se ha podido leer el archivo.',
  },
} as const satisfies Record<string, Record<Lang, string>>;

export type MessageKey = keyof typeof MESSAGES;

/** Testo localizzato prodotto dal core; `{nome}` viene sostituito con i parametri. */
export function t(lang: Lang, key: MessageKey, params: Record<string, string | number> = {}): string {
  const template: string = MESSAGES[key][lang];
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}
