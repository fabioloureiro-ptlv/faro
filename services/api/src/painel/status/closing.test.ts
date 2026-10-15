import { describe, expect, it } from 'vitest';
import { DyCampaignStatusSchema, ExperimentSchema } from '@faro/contracts';
import type { DyCampaignStatus, Experiment } from '@faro/contracts';
import experiments from '@faro/contracts/fixtures/experiments.json';
import campaigns from '@faro/contracts/fixtures/dy-campaigns.json';
import { closingChecklist } from './closing.ts';

const byId = (id: string) => ExperimentSchema.parse(experiments.items.find((e) => e.faroId === id));
const camp = (id: string) => DyCampaignStatusSchema.parse(campaigns.items.find((c) => c.campaignId === id));
const item = (c: ReturnType<typeof closingChecklist>, id: string) => c.items.find((i) => i.id === id)!;

const nexus = byId('FARO-2026-0001'); // decidido em 13/10, campanha ativa
const cupom = byId('FARO-2026-0006'); // encerrado, campanha desligada
const URL_OK = 'https://wiki.example.com/aprendizados/faro-2026-0006';

describe('closingChecklist', () => {
  it('Nexus: decisão ok, DY ainda ativo, sem aprendizado → não pode encerrar', () => {
    const c = closingChecklist(nexus, camp('dy-1001'));
    expect(c.items.map((i) => [i.id, i.done])).toEqual([
      ['decisao', true],
      ['dy_desligado', false],
      ['aprendizado', false],
    ]);
    expect(c.ready).toBe(false);
  });

  it('pronto quando decisão, DY desligado (export D+1) e link https', () => {
    const c = closingChecklist(cupom, camp('dy-1006'), URL_OK);
    expect(c.ready).toBe(true);
    expect(item(c, 'dy_desligado').detail).toBe('Sem exposição desde 29/09 (export de 13/10).');
  });

  describe('campanha desligada no DY', () => {
    const off: DyCampaignStatus = {
      ...camp('dy-1001'),
      active: false,
      lastExposureDate: '2026-10-13',
      asOf: '2026-10-14',
    };

    it('ok: inativa e última exposição no dia da decisão', () => {
      expect(item(closingChecklist(nexus, off), 'dy_desligado').done).toBe(true);
    });
    it('não: exposição depois da decisão', () => {
      const c = closingChecklist(nexus, { ...off, lastExposureDate: '2026-10-14' });
      expect(item(c, 'dy_desligado')).toMatchObject({
        done: false,
        detail: 'Ainda com exposição no DY em 14/10.',
      });
    });
    it('não: export ainda é do dia da decisão', () => {
      const c = closingChecklist(nexus, { ...off, asOf: '2026-10-13' });
      expect(item(c, 'dy_desligado').detail).toBe('Aguardando o export do dia seguinte à decisão.');
    });
    it('não: sem exposição mas ainda marcada como ativa', () => {
      const c = closingChecklist(nexus, { ...off, active: true });
      expect(item(c, 'dy_desligado').done).toBe(false);
    });
    it('não: sem campanha vinculada', () => {
      expect(item(closingChecklist(nexus, undefined), 'dy_desligado').done).toBe(false);
    });
    it('não: sem decisão', () => {
      const { decision: _decision, ...semDecisao } = nexus;
      const c = closingChecklist({ ...semDecisao, status: 'rodando' } as Experiment, off);
      expect(item(c, 'decisao').done).toBe(false);
      expect(item(c, 'dy_desligado').done).toBe(false);
    });
  });

  describe('aprendizado publicado', () => {
    it('aceita só https', () => {
      expect(
        item(closingChecklist(cupom, camp('dy-1006'), 'http://x.example.com'), 'aprendizado'),
      ).toMatchObject({
        done: false,
        detail: 'O link precisa começar com https://.',
      });
      expect(item(closingChecklist(cupom, camp('dy-1006'), 'javascript:alert(1)'), 'aprendizado').done).toBe(
        false,
      );
    });
    it('usa o link já gravado na decisão', () => {
      const e: Experiment = { ...cupom, decision: { ...cupom.decision!, learningUrl: URL_OK } };
      expect(item(closingChecklist(e, camp('dy-1006')), 'aprendizado').done).toBe(true);
    });
  });
});
