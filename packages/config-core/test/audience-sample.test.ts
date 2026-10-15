import { describe, expect, it } from 'vitest';
import { audienceSample } from '../src/index.ts';

const BASE = 15_270_545;

describe('amostra a partir do público', () => {
  it('número da query × percentual abordado, dividido pelo split', () => {
    const s = audienceSample({ eligibleClients: 3_953_747, baseClients: BASE, trafficPercent: 40, split: [0.5, 0.25, 0.25] })!;
    expect(s.source).toBe('bigquery');
    expect(s.eligible).toBe(3_953_747);
    expect(s.total).toBe(1_581_499);
    expect(s.perGroup.map((g) => g.size)).toEqual([790_750, 395_375, 395_375]);
    expect(s.perGroup.map((g) => g.share)).toEqual([0.5, 0.25, 0.25]);
  });

  it('sem contagem, usa participação × base e avisa que é estimativa', () => {
    const s = audienceSample({ estimatedShare: 0.1, baseClients: BASE, trafficPercent: 100, split: [0.5, 0.5] })!;
    expect(s).toMatchObject({ source: 'estimado', eligible: 1_527_055, total: 1_527_055 });
  });

  it('a contagem do BigQuery vale mais que a participação', () => {
    const s = audienceSample({ eligibleClients: 1000, estimatedShare: 0.9, baseClients: BASE, trafficPercent: 50, split: [1] })!;
    expect(s).toMatchObject({ source: 'bigquery', eligible: 1000, total: 500 });
  });

  it('sem contagem nem participação não há amostra; percentual fora de 0–100 é limitado', () => {
    expect(audienceSample({ baseClients: BASE, trafficPercent: 50, split: [0.5, 0.5] })).toBeNull();
    expect(audienceSample({ estimatedShare: 0, baseClients: BASE, trafficPercent: 50, split: [1] })).toBeNull();
    expect(audienceSample({ eligibleClients: 100, baseClients: BASE, trafficPercent: 250, split: [1] })?.total).toBe(100);
    expect(audienceSample({ eligibleClients: 0, baseClients: BASE, trafficPercent: 50, split: [1] })?.total).toBe(0);
  });
});
