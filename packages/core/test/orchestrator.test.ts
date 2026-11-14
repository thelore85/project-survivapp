import { describe, expect, it } from 'vitest';
import { classifyIntent, parseContextBlock, type Domain, type SessionState } from '../src';
import { RED, makeHarness, texturedImage } from './helpers';

/** Set di test del routing (PRD sezione 15): frase, presenza di foto, dominio atteso. */
const ROUTING_SET: [string, boolean, Domain][] = [
  // botanica
  ['', true, 'botanical'],
  ['che fungo è questo?', true, 'botanical'],
  ['what plant is this?', true, 'botanical'],
  ['¿qué seta es esta?', true, 'botanical'],
  ['parlami delle foglie di questa pianta', false, 'botanical'],
  ['which trees have red berries', false, 'botanical'],
  ['¿qué flores crecen en primavera?', false, 'botanical'],
  ['differenze tra le specie di funghi con lamelle bianche', false, 'botanical'],
  ['tell me about mushroom gills and species', false, 'botanical'],
  ['hojas de arbol con borde dentado', false, 'botanical'],
  // survival
  ['come purifico l’acqua di un torrente?', false, 'survival'],
  ['how do I start a fire without matches', false, 'survival'],
  ['¿cómo construyo un refugio para la noche?', false, 'survival'],
  ['cosa fare in caso di ipotermia', false, 'survival'],
  ['how to tie a knot for a tarp', false, 'survival'],
  ['señales de rescate con espejo', false, 'survival'],
  ['come mi oriento senza bussola', false, 'survival'],
  ['first aid for a deep wound', false, 'survival'],
  ['cosa dice il manuale sulla neve', false, 'survival'],
  ['como tratar una quemadura', false, 'survival'],
  ['how to find food in winter', false, 'survival'],
  ['tecniche di sopravvivenza in montagna', false, 'survival'],
  // misto
  ['questa pianta serve per accendere il fuoco?', true, 'mixed'],
  ['can I use this mushroom as food in a survival situation', true, 'mixed'],
  ['quali piante indicano la presenza di acqua', false, 'mixed'],
  ['which trees give the best wood for a shelter', false, 'mixed'],
  ['¿qué plantas sirven para purificar el agua?', false, 'mixed'],
  // generale
  ['ciao', false, 'general'],
  ['hello there', false, 'general'],
  ['hola, ¿qué puedes hacer?', false, 'general'],
  ['cosa sai fare?', false, 'general'],
  ['how does this work', false, 'general'],
  ['grazie', false, 'general'],
  // ambiguo
  ['dimmi di più', false, 'clarification_required'],
  ['e quindi?', false, 'clarification_required'],
  ['what about the red one', false, 'clarification_required'],
  ['no entiendo', false, 'clarification_required'],
  ['quanto pesa un elefante adulto in media', false, 'clarification_required'],
];

describe('classificazione dell’intento', () => {
  const emptyState: SessionState = {};

  it.each(ROUTING_SET)('"%s" (foto: %s) → %s', (text, hasImage, expected) => {
    const intent = classifyIntent(text, { hasImage, mentionsSpecies: false, state: emptyState });
    expect(intent.domain).toBe(expected);
  });

  it('il nome di una specie del catalogo è un segnale botanico', () => {
    const intent = classifyIntent('habitat di amanita muscaria', { hasImage: false, mentionsSpecies: true, state: emptyState });
    expect(intent).toMatchObject({ domain: 'botanical', reason: 'species_name' });
  });

  it('una domanda breve senza segnali continua l’argomento precedente', () => {
    const state: SessionState = { lastDomain: 'botanical', lastSpeciesIds: ['amanita-muscaria'] };
    const intent = classifyIntent('dimmi di più', { hasImage: false, mentionsSpecies: false, state });
    expect(intent).toMatchObject({ domain: 'botanical', usesContext: true });
  });

  it('chiede una foto se si vuole identificare senza immagine', () => {
    const intent = classifyIntent('puoi identificare un fungo?', { hasImage: false, mentionsSpecies: false, state: emptyState });
    expect(intent).toMatchObject({ domain: 'botanical', needsImage: true });
  });
});

describe('orchestratore', () => {
  it('instrada una domanda survival e conserva la provenienza', async () => {
    const { orchestrator } = await makeHarness();
    const reply = await orchestrator.handle({ conversationId: 'c1', text: 'How do I purify water?', lang: 'en' });
    expect(reply.domain).toBe('survival');
    expect(reply.parts).toHaveLength(1);
    expect(reply.timings?.partsMs).toHaveLength(1);
    expect(reply.timings?.totalMs).toBeGreaterThanOrEqual(0);
    expect(reply.parts[0]).toMatchObject({ kind: 'survival', status: 'answered' });
  });

  it('instrada una foto al modulo botanico', async () => {
    const { orchestrator } = await makeHarness();
    const reply = await orchestrator.handle({
      conversationId: 'c1',
      text: '',
      lang: 'it',
      image: { pixels: texturedImage(RED, 256, 3), ref: 'photos/1.jpg' },
    });
    expect(reply.domain).toBe('botanical');
    expect(reply.parts[0]).toMatchObject({ kind: 'botanical', status: 'candidates' });
  });

  it('passa il contesto precedente al modulo botanico', async () => {
    const { orchestrator, conversations } = await makeHarness();
    await orchestrator.handle({ conversationId: 'c1', text: '', lang: 'it', image: { pixels: texturedImage(RED, 256, 3) } });
    expect((await conversations.getState('c1')).lastSpeciesIds?.[0]).toBe('amanita-muscaria');

    const reply = await orchestrator.handle({ conversationId: 'c1', text: 'qual è il suo habitat?', lang: 'it' });
    expect(reply.domain).toBe('botanical');
    expect(reply.routingReason).toBe('follow_up');
    const part = reply.parts[0];
    expect(part?.kind === 'botanical' && part.candidates[0]?.id).toBe('amanita-muscaria');
  });

  it('un seguito breve eredita l’argomento della domanda survival precedente', async () => {
    const { orchestrator, conversations } = await makeHarness();
    await orchestrator.handle({ conversationId: 'c1', text: 'Come costruire un riparo?', lang: 'it' });
    const reply = await orchestrator.handle({ conversationId: 'c1', text: 'che materiali usare?', lang: 'it' });

    expect(reply.domain).toBe('survival');
    expect(reply.routingReason).toBe('follow_up');
    const part = reply.parts[0];
    expect(part?.kind === 'survival' && part.status).toBe('answered');
    expect(part?.kind === 'survival' && part.citations[0]?.page).toBe(40);
    expect((await conversations.getState('c1')).lastSurvivalQuestion).toBe('Come costruire un riparo?');
  });

  it('una richiesta ambigua genera una domanda di chiarimento e poi riprende la domanda', async () => {
    const { orchestrator, conversations } = await makeHarness();
    const first = await orchestrator.handle({ conversationId: 'c1', text: 'lean-to ridge pole', lang: 'it' });
    expect(first.domain).toBe('clarification_required');
    expect(first.parts[0]).toMatchObject({ kind: 'clarification' });
    expect((await conversations.getState('c1')).pendingQuestion).toBe('lean-to ridge pole');

    const second = await orchestrator.handle({ conversationId: 'c1', text: 'Manuali di sopravvivenza', lang: 'it' });
    expect(second.domain).toBe('survival');
    const part = second.parts[0];
    expect(part?.kind === 'survival' && part.citations[0]?.page).toBe(40);
    expect((await conversations.getState('c1')).pendingQuestion).toBeUndefined();
  });

  it('una richiesta mista invoca i due moduli in sequenza e passa i candidati come contesto', async () => {
    const { orchestrator, llm } = await makeHarness();
    const reply = await orchestrator.handle({
      conversationId: 'c1',
      text: 'posso usarlo per accendere il fuoco?',
      lang: 'it',
      image: { pixels: texturedImage(RED, 256, 3) },
    });
    expect(reply.domain).toBe('mixed');
    expect(reply.parts.map((part) => part.kind)).toEqual(['botanical', 'survival']);
    // Due chiamate al modello, una per modulo: nessuna catena autonoma.
    expect(llm.requests).toHaveLength(2);
    expect(parseContextBlock(llm.requests[1]!.messages.at(-1)!.content).length).toBeGreaterThan(0);
  });

  it('conserva la cronologia localmente e la restituisce nell’ordine corretto', async () => {
    const { orchestrator, conversations } = await makeHarness();
    await orchestrator.handle({ conversationId: 'c1', text: 'ciao', lang: 'it' });
    await orchestrator.handle({ conversationId: 'c1', text: 'How do I start a fire?', lang: 'it' });

    const messages = await conversations.messages('c1');
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect((await conversations.list())[0]).toMatchObject({ id: 'c1', title: 'ciao' });

    await conversations.delete('c1');
    expect(await conversations.list()).toEqual([]);
    expect(await conversations.messages('c1')).toEqual([]);
  });

  it('i moduli restano utilizzabili se un modello non si carica', async () => {
    const { orchestrator, llm } = await makeHarness();
    llm.load = async () => {
      throw new Error('out of memory');
    };
    const reply = await orchestrator.handle({ conversationId: 'c1', text: 'How do I purify water?', lang: 'en' });
    expect(reply.parts[0]).toMatchObject({ kind: 'survival', status: 'extractive' });
  });
});
