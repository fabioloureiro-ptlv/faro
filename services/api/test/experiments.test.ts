import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExperimentSchema, FaroEventSchema, DySheetSchema } from '@faro/contracts';
import { PM, completeDesign, createDraft, okAllocation, patch, readyDraft, setup, type Ctx } from './helpers.ts';

let ctx: Ctx;
afterEach(async () => ctx?.close());

const events = async (faroId?: string) =>
  (await ctx.app.inject({ url: `/events${faroId ? `?faroId=${faroId}` : ''}` })).json() as { type: string; faroId: string }[];

describe('rascunho e faroId (CFG-10, CFG-01)', () => {
  beforeEach(async () => (ctx = await setup()));

  it('cria rascunho com faroId, status rascunho e evento created', async () => {
    const { experiment, derived } = await createDraft(ctx.app);
    expect(experiment.faroId).toBe('FARO-2026-0001');
    expect(experiment.status).toBe('rascunho');
    expect(experiment.ownerEmail).toBe('pm@example.com');
    ExperimentSchema.parse(experiment);
    expect(derived.unlockedSteps).toEqual([1]);
    const ev = await events();
    expect(ev.map((e) => e.type)).toEqual(['experiment.created']);
    FaroEventSchema.parse(ev[0]);
  });

  it('exige identidade', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/experiments', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('20 criações concorrentes geram faroIds únicos e sequenciais', async () => {
    const ids = (await Promise.all(Array.from({ length: 20 }, () => createDraft(ctx.app)))).map((r) => r.experiment.faroId);
    expect(new Set(ids).size).toBe(20);
    expect([...ids].sort()).toEqual(Array.from({ length: 20 }, (_, i) => `FARO-2026-${String(i + 1).padStart(4, '0')}`));
  });

  it('faroId é imutável e status não é editável', async () => {
    const { experiment } = await createDraft(ctx.app);
    expect((await patch(ctx.app, experiment.faroId, { faroId: 'FARO-2026-9999' })).statusCode).toBe(400);
    expect((await patch(ctx.app, experiment.faroId, { status: 'configurado_no_dy' })).statusCode).toBe(400);
    expect((await patch(ctx.app, experiment.faroId, { campoQualquer: 1 })).statusCode).toBe(400);
    const same = await patch(ctx.app, experiment.faroId, { faroId: experiment.faroId, name: 'Teste' });
    expect(same.statusCode).toBe(200);
    expect(same.json().experiment.faroId).toBe(experiment.faroId);
  });

  it('a numeração reinicia no ano seguinte', async () => {
    await createDraft(ctx.app);
    ctx.setNow('2027-01-02T12:00:00Z');
    expect((await createDraft(ctx.app)).experiment.faroId).toBe('FARO-2027-0001');
  });

  it('cria a partir de template (frente 5)', async () => {
    const { experiment } = await createDraft(ctx.app, { templateId: 'tpl-teste-preco' });
    expect(experiment.templateId).toBe('tpl-teste-preco');
    // Biblioteca real da frente 5 (05-templates.md § 5): teste de preço decide por
    // margem 2, não por receita (o mock da frente 1 usava receita_por_usuario).
    expect(experiment.design.primaryMetricId).toBe('margem_2_por_usuario');
    const bad = await ctx.app.inject({ method: 'POST', url: '/experiments', headers: PM, payload: { templateId: 'x' } });
    expect(bad.statusCode).toBe(422);
  });
});

describe('gate de design no autosave (CFG-02)', () => {
  beforeEach(async () => (ctx = await setup()));

  it('design completo vira design_completo e emite design_completed uma vez', async () => {
    const r = await readyDraft(ctx);
    expect(r.experiment.status).toBe('design_completo');
    expect(r.derived.unlockedSteps).toEqual([1, 2, 3, 4]);
    await patch(ctx.app, r.experiment.faroId, { name: 'Selo de entrega na busca' });
    const types = (await events(r.experiment.faroId)).map((e) => e.type);
    expect(types.filter((t) => t === 'experiment.design_completed')).toHaveLength(1);
  });

  it('design que fica incompleto volta a rascunho, com a regra que falhou', async () => {
    const r = await readyDraft(ctx);
    const res = await patch(ctx.app, r.experiment.faroId, { design: { ...completeDesign, secondaryMetricIds: [] } });
    const body = res.json();
    expect(body.experiment.status).toBe('rascunho');
    expect(body.derived.gate.checks.filter((c: { ok: boolean }) => !c.ok).map((c: { id: string }) => c.id)).toEqual(['metricas_secundarias']);
  });

  it('métrica fora do catálogo não passa', async () => {
    const r = await readyDraft(ctx);
    const res = await patch(ctx.app, r.experiment.faroId, { design: { ...completeDesign, primaryMetricId: 'inventada' } });
    expect(res.json().derived.gate.complete).toBe(false);
  });

  it('calcula amostra e duração com elegíveis da frente 3 (mock)', async () => {
    const r = await readyDraft(ctx);
    const d = r.derived as unknown as { sample: { nPerGroup: number }; eligibleDaily: number; duration: { durationDays: number; alerts: { code: string }[] } };
    expect(d.sample.nPerGroup).toBe(50804);
    expect(d.eligibleDaily).toBe(47500); // busca 95.000 × 100% plataformas × 100% público × 50%
    expect(d.duration.durationDays).toBe(3);
    expect(d.duration.alerts.map((a) => a.code)).toEqual(['menos_de_7_dias']);
  });
});

describe('sobreposição, revisão e ficha (CFG-09, CFG-11)', () => {
  beforeEach(async () => (ctx = await setup({ seed: true })));

  it('home no app gera conflito com o Nexus que precisa de decisão', async () => {
    const r = await readyDraft(ctx, { pages: ['home'], platforms: ['android', 'ios'] });
    const nexus = r.experiment.overlap?.find((o) => o.otherFaroId === 'FARO-2026-0001');
    // Motor real da frente 3 (SEG-11): o Nexus ocupa 98% da home do app, então o
    // cruzamento passa de 20% do público do rascunho e a severidade sobe para alto
    // (o mock da frente 1 classificava como médio). Ambos exigem resolução.
    expect(nexus).toMatchObject({ severity: 'alto' });
    expect(r.derived.unlockedSteps).toEqual([1, 2, 3]);
    const blocked = await ctx.app.inject({ method: 'POST', url: `/experiments/${r.experiment.faroId}/ready`, headers: PM });
    expect(blocked.statusCode).toBe(422);
    expect(blocked.json().details.map((c: { id: string }) => c.id)).toContain('sobreposicao');

    const resolved = await patch(ctx.app, r.experiment.faroId, {
      overlapResolutions: (r.experiment.overlap ?? []).map((o) => ({ otherFaroId: o.otherFaroId, resolution: 'exclusao_mutua' })),
    });
    const o = resolved.json().experiment.overlap.find((x: { otherFaroId: string }) => x.otherFaroId === 'FARO-2026-0001');
    expect(o).toMatchObject({ resolution: 'exclusao_mutua', decidedBy: 'pm@example.com' });
    expect(resolved.json().derived.unlockedSteps).toEqual([1, 2, 3, 4]);

    // A decisão sobrevive a novos saves
    const again = await patch(ctx.app, r.experiment.faroId, { name: 'Selo de entrega rápida (home)' });
    expect(again.json().derived.overlapCheck.ok).toBe(true);
  });

  it('ficha só depois da revisão; JSON e Markdown', async () => {
    const r = await readyDraft(ctx);
    const id = r.experiment.faroId;
    expect((await ctx.app.inject({ url: `/experiments/${id}/dy-sheet` })).statusCode).toBe(409);
    const ready = await ctx.app.inject({ method: 'POST', url: `/experiments/${id}/ready`, headers: PM });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().experiment.status).toBe('pronto_para_configurar');
    expect(ready.json().experiment.dy.labels).toContain(`faro:${id}`);

    const sheet = DySheetSchema.parse((await ctx.app.inject({ url: `/experiments/${id}/dy-sheet` })).json());
    expect(sheet.blocks.find((b) => b.key === 'campaign_name')!.value).toBe(`${id} | Selo de entrega rápida na busca`);
    const md = await ctx.app.inject({ url: `/experiments/${id}/dy-sheet?format=md` });
    expect(md.headers['content-type']).toContain('text/markdown');
    expect(md.body).toContain(`# Ficha de configuração do DY — ${id}`);
  });

  it('amostra, usuários por dia e duração são informativos: duração maior que o período não bloqueia', async () => {
    const r = await readyDraft(ctx, { pages: ['saude'], platforms: ['ios'], trafficPercent: 10, endDate: '2026-10-25' });
    const d = r.derived as unknown as { duration: { blocking: boolean; alerts: { code: string }[] }; audienceChecks: { id: string }[] };
    // O cálculo continua dizendo que o período não comporta a amostra...
    expect(d.duration.blocking).toBe(true);
    expect(d.duration.alerts.map((a) => a.code)).toContain('periodo_insuficiente');
    // ...mas isso não é pré-requisito: o Público libera a sobreposição.
    expect(d.audienceChecks.map((c) => c.id)).not.toContain('viabilidade');
    expect(r.derived.unlockedSteps).toContain(3);
    const res = await ctx.app.inject({ method: 'POST', url: `/experiments/${r.experiment.faroId}/ready`, headers: PM });
    // O motor real da frente 3 acha sobreposição não resolvida nesse cenário; só ela barra a revisão.
    expect(res.statusCode).toBe(422);
    expect(res.json().details.map((c: { id: string }) => c.id)).toEqual(['sobreposicao']);
  });

  it('editar depois de pronto e quebrar a prontidão volta a design_completo', async () => {
    const r = await readyDraft(ctx);
    await ctx.app.inject({ method: 'POST', url: `/experiments/${r.experiment.faroId}/ready`, headers: PM });
    const res = await patch(ctx.app, r.experiment.faroId, { allocation: { ...okAllocation, pages: [] } });
    expect(res.json().experiment.status).toBe('design_completo');
  });
});

describe('confirmação e auditoria (CFG-12, RNF auditoria)', () => {
  beforeEach(async () => (ctx = await setup()));

  async function configured() {
    const r = await readyDraft(ctx);
    const id = r.experiment.faroId;
    await ctx.app.inject({ method: 'POST', url: `/experiments/${id}/ready`, headers: PM });
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/experiments/${id}/dy-confirmation`,
      headers: { 'x-faro-user': 'operador@example.com' },
      payload: { campaignId: '1234567', configuredBy: 'operador@example.com', configuredAt: '2026-10-15T10:00:00-03:00' },
    });
    return { id, res };
  }

  it('confirma: status configurado_no_dy e evento configured', async () => {
    const { id, res } = await configured();
    expect(res.statusCode).toBe(200);
    expect(res.json().experiment).toMatchObject({ status: 'configurado_no_dy', dy: { campaignId: '1234567', configuredBy: 'operador@example.com' } });
    expect((await events(id)).map((e) => e.type)).toContain('experiment.configured');
  });

  it('não confirma duas vezes nem reaproveita campanha', async () => {
    const { id } = await configured();
    const again = await ctx.app.inject({ method: 'POST', url: `/experiments/${id}/dy-confirmation`, headers: PM, payload: { campaignId: '999', configuredBy: 'x@example.com', configuredAt: '2026-10-15T10:00:00Z' } });
    expect(again.statusCode).toBe(409);

    const other = await readyDraft(ctx);
    await ctx.app.inject({ method: 'POST', url: `/experiments/${other.experiment.faroId}/ready`, headers: PM });
    const dup = await ctx.app.inject({ method: 'POST', url: `/experiments/${other.experiment.faroId}/dy-confirmation`, headers: PM, payload: { campaignId: '1234567', configuredBy: 'x@example.com', configuredAt: '2026-10-15T10:00:00Z' } });
    expect(dup.statusCode).toBe(409);
    const bad = await ctx.app.inject({ method: 'POST', url: `/experiments/${other.experiment.faroId}/dy-confirmation`, headers: PM, payload: { campaignId: 'a b', configuredBy: 'x@example.com', configuredAt: '2026-10-15T10:00:00Z' } });
    expect(bad.statusCode).toBe(400);
  });

  it('mudança de design depois de configurado fica auditada com autor e data', async () => {
    const { id } = await configured();
    const res = await patch(ctx.app, id, { design: { ...completeDesign, mdeRelative: 0.08 } }, { 'x-faro-user': 'outra@example.com' });
    expect(res.statusCode).toBe(200);
    expect(res.json().experiment.status).toBe('configurado_no_dy');
    const audit = (await ctx.app.inject({ url: `/experiments/${id}/audit` })).json();
    expect(audit).toEqual([expect.objectContaining({ field: 'design.mdeRelative', before: 0.05, after: 0.08, author: 'outra@example.com', at: '2026-10-14T13:00:00.000Z' })]);
  });

  it('depois de configurado, o design não pode ficar incompleto', async () => {
    const { id } = await configured();
    const res = await patch(ctx.app, id, { design: { ...completeDesign, context: 'curto' } });
    expect(res.statusCode).toBe(422);
  });
});

describe('duplicar e importar legado (CFG-14, CFG-15)', () => {
  it('duplicar cria rascunho novo sem datas, DY e decisão', async () => {
    ctx = await setup({ seed: true });
    const res = await ctx.app.inject({ method: 'POST', url: '/experiments/FARO-2026-0006/duplicate', headers: PM });
    expect(res.statusCode).toBe(201);
    const e = res.json().experiment;
    expect(e.faroId).toBe('FARO-2026-0009');
    // design copiado está completo: o rascunho já nasce em design_completo
    expect(e).toMatchObject({ status: 'design_completo', legacy: false, allocation: { startDate: '', endDate: '' } });
    expect(e.dy).toBeUndefined();
    expect(e.decision).toBeUndefined();
    expect(e.design.primaryMetricId).toBe('conversao');
  });

  it('importa o Nexus como legado com design não registrado', async () => {
    ctx = await setup();
    const body = { dyCampaignId: 'dy-nexus-home-app', bu: 'ecossistema', ownerSquad: 'Nexus' };
    const res = await ctx.app.inject({ method: 'POST', url: '/experiments/import-legacy', headers: PM, payload: body });
    expect(res.statusCode).toBe(201);
    const { experiment: e, derived } = res.json();
    expect(e).toMatchObject({ legacy: true, status: 'configurado_no_dy', name: 'Nexus | Nova Home do App', allocation: { platforms: ['android', 'ios'], pages: ['home'] } });
    expect(e.design.control.name).toBe('home antiga');
    expect(e.design.variants[0].name).toBe('home nova');
    expect(e.allocation.split[0]).toBeCloseTo(0.0191, 3);
    expect(derived.designRegistered).toBe(false);
    ExperimentSchema.parse(e);

    const again = await ctx.app.inject({ method: 'POST', url: '/experiments/import-legacy', headers: PM, payload: body });
    expect(again.statusCode).toBe(409);
    const missing = await ctx.app.inject({ method: 'POST', url: '/experiments/import-legacy', headers: PM, payload: { ...body, dyCampaignId: 'nao-existe' } });
    expect(missing.statusCode).toBe(404);
  });

  it('dono completa o design mínimo do legado e ele passa a registrado', async () => {
    ctx = await setup();
    const res = await ctx.app.inject({ method: 'POST', url: '/experiments/import-legacy', headers: PM, payload: { dyCampaignId: 'dy-nexus-home-app', bu: 'ecossistema', ownerSquad: 'Nexus' } });
    const e = res.json().experiment;
    const done = await patch(ctx.app, e.faroId, {
      design: {
        ...e.design,
        context: 'A home antiga do app tinha baixa descoberta de categorias e de saúde; dados de navegação mostram queda de cliques.',
        hypothesis: { change: 'a nova home do app substituir a antiga', expectedEffect: 'a receita por usuário vai aumentar', because: 'a navegação por categorias fica mais curta' },
        // Ajuste de produto (14/10): design registrado exige Figma ou print em cada variante.
        variants: e.design.variants.map((v: { key: string }) => ({ ...v, figmaUrl: 'https://www.figma.com/file/nexus/home-nova' })),
        primaryMetricId: 'receita_por_usuario',
        secondaryMetricIds: ['conversao_carrinho'],
      },
    });
    expect(done.statusCode).toBe(200);
    expect(done.json().derived.designRegistered).toBe(true);
    expect(done.json().experiment.status).toBe('configurado_no_dy');
  });
});

describe('catálogo de métricas (CFG-05)', () => {
  beforeEach(async () => (ctx = await setup()));

  it('cria métrica rascunho e ela aparece no catálogo', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/catalog/metrics', headers: PM, payload: { name: 'Pedidos com 2+ itens', kind: 'proportion', definition: 'Usuários com pedido de 2+ itens ÷ usuários expostos', baseline: 0.125 } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: 'pedidos_com_2_itens', status: 'rascunho', baseline: 0.125 });
    const list = (await ctx.app.inject({ url: '/catalog/metrics' })).json();
    expect(list.some((m: { id: string }) => m.id === 'pedidos_com_2_itens')).toBe(true);
    const dup = await ctx.app.inject({ method: 'POST', url: '/catalog/metrics', headers: PM, payload: { name: 'Pedidos com 2+ itens', kind: 'proportion', definition: 'Outra definição qualquer', baseline: 0.1 } });
    expect(dup.statusCode).toBe(409);
  });

  it('valida a linha de base', async () => {
    const pct = await ctx.app.inject({ method: 'POST', url: '/catalog/metrics', headers: PM, payload: { name: 'Taxa x', kind: 'proportion', definition: 'Usuários x ÷ expostos', baseline: 12.5 } });
    expect(pct.statusCode).toBe(400);
    const mean = await ctx.app.inject({ method: 'POST', url: '/catalog/metrics', headers: PM, payload: { name: 'Valor x', kind: 'mean', definition: 'Valor x ÷ expostos', baseline: 189 } });
    expect(mean.statusCode).toBe(400);
    expect(mean.json().details[0].message).toBe('Informe o desvio padrão.');
  });
});

describe('sugestões de datas e de MDE (ajustes de produto 15/10)', () => {
  beforeEach(async () => (ctx = await setup({ seed: true })));

  it('sugere datas a partir da duração e lista os testes interpostos', async () => {
    // Home no app cruza com o Nexus (FARO-2026-0001, até 30/11) e o Exemplo de saúde (FARO-2026-0004, 01/10 → 29/10).
    const { experiment } = await readyDraft(ctx, { pages: ['home'], platforms: ['android', 'ios'], startDate: '', endDate: '' });
    const res = await ctx.app.inject({ url: `/experiments/${experiment.faroId}/date-suggestion`, headers: PM });
    expect(res.statusCode).toBe(200);
    const s = res.json();
    expect(s.startDate).toBe('2026-10-15'); // dia seguinte ao relógio do teste (14/10)
    expect(s.days % 7).toBe(0);
    expect(s.basedOn).toBe('amostra');
    expect(s.overlapping.map((b: { faroId: string }) => b.faroId)).toEqual(expect.arrayContaining(['FARO-2026-0001', 'FARO-2026-0004']));
    expect(s.freeWindow.startDate > '2026-11-30').toBe(true);
  });

  it('sugere o MDE pela base histórica da NORTE', async () => {
    const { experiment } = await readyDraft(ctx);
    // NORTE conversão: com o seed enxuto, só o Exemplo 0006 (encerrado, checkout) tem leitura dessa métrica.
    const r1 = await patch(ctx.app, experiment.faroId, { design: { ...completeDesign, primaryMetricId: 'conversao', secondaryMetricIds: ['receita_por_usuario'] } });
    expect(r1.statusCode).toBe(200);
    const res = await ctx.app.inject({ url: `/experiments/${experiment.faroId}/mde-suggestion`, headers: PM });
    expect(res.statusCode).toBe(200);
    const s = res.json();
    expect(s.metricId).toBe('conversao');
    expect(s.sampleCount).toBeGreaterThanOrEqual(1);
    expect(s.basis.map((b: { faroId: string }) => b.faroId)).toContain('FARO-2026-0006');
    expect(s.suggested).toBeGreaterThanOrEqual(0.01);
    expect(s.suggested).toBeLessThanOrEqual(0.3);
    expect(s.basis[0]).toHaveProperty('similarity');
    expect(s.basis.every((b: { faroId: string }) => b.faroId !== experiment.faroId)).toBe(true);
  });

  it('sem NORTE, a sugestão de MDE explica o que falta', async () => {
    const { experiment } = await createDraft(ctx.app);
    const res = await ctx.app.inject({ url: `/experiments/${experiment.faroId}/mde-suggestion`, headers: PM });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('sem_norte');
  });

  it('alvo da página (URL e caminho do app) persiste e aparece na ficha', async () => {
    const { experiment } = await readyDraft(ctx, {
      pages: ['busca'],
      pageTargets: [{ pageId: 'busca', urlPattern: '/busca?q=', appPath: 'SearchScreen' }],
    });
    expect(experiment.allocation.pageTargets).toEqual([{ pageId: 'busca', urlPattern: '/busca?q=', appPath: 'SearchScreen' }]);
    const ready = await ctx.app.inject({ method: 'POST', url: `/experiments/${experiment.faroId}/ready`, headers: PM, payload: {} });
    expect(ready.statusCode).toBe(200);
    const sheet = (await ctx.app.inject({ url: `/experiments/${experiment.faroId}/dy-sheet`, headers: PM })).json();
    expect(sheet.blocks.find((b: { key: string }) => b.key === 'pages').value).toBe('Busca (busca) · site: /busca?q= · app: SearchScreen');
  });

  it('cria métrica rascunho na área Retenção', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/catalog/metrics', headers: PM, payload: { name: 'Retenção 30 dias', kind: 'proportion', section: 'Retenção', definition: 'Usuários ativos em D+30 ÷ usuários expostos', baseline: 0.41 } });
    expect(res.statusCode).toBe(201);
    expect(res.json().section).toBe('Retenção');
  });
});
