import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FaroEventSchema } from '@faro/contracts';
import {
  InMemoryAnuncio,
  anuncioPortsFromEnv,
  extraMentions,
  jiraRest,
  slackBot,
  slackWebhook,
  type FetchLike,
} from '../src/anuncio/clients.ts';
import { buildAnuncio, faroLink } from '../src/anuncio/resumo.ts';
import { PM, readyDraft, setup, type Ctx } from './helpers.ts';

let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

async function pronto() {
  const r = await readyDraft(ctx!);
  const ready = await ctx!.app.inject({
    method: 'POST',
    url: `/experiments/${r.experiment.faroId}/ready`,
    headers: PM,
  });
  expect(ready.statusCode).toBe(200);
  return r.experiment.faroId;
}
const anunciar = (id: string) =>
  ctx!.app.inject({ method: 'POST', url: `/experiments/${id}/anunciar`, headers: PM });
const events = async (id: string) =>
  (await ctx!.app.inject({ url: `/events?faroId=${id}` })).json() as {
    type: string;
    payload: Record<string, unknown>;
  }[];

describe('resumo do aviso', () => {
  beforeEach(async () => (ctx = await setup()));

  it('monta Slack (mrkdwn) e Jira (wiki) com hipótese, NORTE, onde, público, datas e ficha', async () => {
    const id = await pronto();
    const { experiment } = (await ctx!.app.inject({ url: `/experiments/${id}` })).json();
    const sheet = (await ctx!.app.inject({ url: `/experiments/${id}/dy-sheet` })).json();
    const a = buildAnuncio(experiment, {
      metricName: (m) =>
        ({
          conversao_carrinho: 'Conversão para o carrinho',
          tempo_carregamento: 'Tempo de carregamento',
        })[m] ?? m,
      pageName: (p) => ({ busca: 'Busca' })[p] ?? p,
      sheet,
      webOrigin: 'http://localhost:3000',
      jira: { key: 'EXP-12', url: 'https://jira.example.com/browse/EXP-12' },
    });
    expect(a.titulo).toBe('Selo de entrega rápida na busca');
    expect(a.slackText.split('\n')[0]).not.toContain(id); // o código fica na ficha e no link, não no título
    expect(a.slackText).toContain('*Teste pronto para configurar no DY*');
    expect(a.slackText).toContain('*Hipótese:* Se mostrarmos o selo');
    expect(a.slackText).toContain(
      '*Métrica principal:* Conversão para o carrinho (efeito mínimo 5%) · guardas: Tempo de carregamento',
    );
    expect(a.slackText).toContain('*Onde:* Busca · Site, Android, iOS');
    expect(a.slackText).toContain('50% do tráfego · split 50% × 50%');
    expect(a.slackText).toContain('*Quando:* 19/10 a 30/11');
    expect(a.slackText).toContain('<https://jira.example.com/browse/EXP-12|EXP-12>');
    expect(a.slackText).toContain(`<http://localhost:3000/configuracao/${id}|ficha e design>`);
    expect(a.jiraSummary).toBe('[Faro] Configurar no DY: Selo de entrega rápida na busca');
    expect(a.jiraDescription).toMatch(/^h2\. Resumo do teste/);
    expect(a.jiraDescription).toContain('h2. Ficha de configuração do DY');
    for (const b of sheet.blocks) expect(a.jiraDescription).toContain(`*${b.label}*`);
    expect(a.jiraDescription).toContain('{noformat}');
  });

  it('link do Faro usa a primeira origem e some sem FARO_WEB_ORIGIN', () => {
    expect(faroLink('http://a.local,http://b.local', 'FARO-2026-0001')).toBe(
      'http://a.local/configuracao/FARO-2026-0001',
    );
    expect(faroLink('http://a.local/', 'FARO-2026-0001')).toBe(
      'http://a.local/configuracao/FARO-2026-0001',
    );
    expect(faroLink(undefined, 'FARO-2026-0001')).toBeUndefined();
  });
});

describe('POST /experiments/:faroId/anunciar', () => {
  beforeEach(async () => (ctx = await setup()));

  it('503 sem nenhum destino configurado', async () => {
    const id = await pronto();
    ctx!.ports.anuncio = {};
    const res = await anunciar(id);
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('aviso_nao_configurado');
  });

  it('409 antes da revisão (sem ficha ainda)', async () => {
    const r = await readyDraft(ctx!);
    ctx!.ports.anuncio = { slack: new InMemoryAnuncio() };
    expect((await anunciar(r.experiment.faroId)).statusCode).toBe(409);
  });

  it('abre o card, manda o Slack com o link do card e registra o evento', async () => {
    const id = await pronto();
    const mem = new InMemoryAnuncio({ channel: '#experimentos' });
    ctx!.ports.anuncio = { slack: mem, jira: mem };
    const res = await anunciar(id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      slack: { status: 'enviado', channel: '#experimentos' },
      jira: { status: 'enviado', key: 'FARO-1', url: 'https://jira.example.com/browse/FARO-1' },
    });
    expect(mem.jiraIssues).toHaveLength(1);
    expect(mem.jiraIssues[0]!.summary).toContain('[Faro] Configurar no DY');
    expect(mem.slackPosts).toHaveLength(1);
    expect(mem.slackPosts[0]).toContain('<https://jira.example.com/browse/FARO-1|FARO-1>');
    expect(mem.slackMentions[0]).toEqual(['pm@example.com']); // o PM que preencheu
    expect(res.json().texto).toBe(mem.slackPosts[0]);
    const ev = (await events(id)).filter((e) => e.type === 'experiment.announced');
    expect(ev).toHaveLength(1);
    FaroEventSchema.parse(ev[0]);
    expect(ev[0]!.payload).toEqual({
      slack: { channel: '#experimentos' },
      jira: { key: 'FARO-1', url: 'https://jira.example.com/browse/FARO-1' },
    });
  });

  it('avisar de novo reaproveita o card e só repete o Slack', async () => {
    const id = await pronto();
    const mem = new InMemoryAnuncio();
    ctx!.ports.anuncio = { slack: mem, jira: mem };
    await anunciar(id);
    const res = await anunciar(id);
    expect(res.json().jira).toEqual({
      status: 'enviado',
      key: 'FARO-1',
      url: 'https://jira.example.com/browse/FARO-1',
    });
    expect(mem.jiraIssues).toHaveLength(1);
    expect(mem.slackPosts).toHaveLength(2);
    expect((await events(id)).filter((e) => e.type === 'experiment.announced')).toHaveLength(2);
  });

  it('só Slack configurado: Jira fica "não configurado" e o evento sai sem card', async () => {
    const id = await pronto();
    const mem = new InMemoryAnuncio();
    ctx!.ports.anuncio = { slack: mem };
    const res = await anunciar(id);
    expect(res.json()).toMatchObject({
      slack: { status: 'enviado' },
      jira: { status: 'nao_configurado' },
    });
    expect(mem.slackPosts[0]).not.toContain('*Card:*');
    expect((await events(id)).find((e) => e.type === 'experiment.announced')!.payload).toEqual({
      slack: {},
    });
  });

  it('falha num destino não derruba o outro nem a resposta', async () => {
    const id = await pronto();
    ctx!.ports.anuncio = {
      slack: new InMemoryAnuncio({ failSlack: true }),
      jira: new InMemoryAnuncio(),
    };
    const res = await anunciar(id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      slack: { status: 'falhou' },
      jira: { status: 'enviado', key: 'FARO-1' },
    });
    expect((await events(id)).filter((e) => e.type === 'experiment.announced')).toHaveLength(1);
  });

  it('os dois falhando: resposta 200 com os status e nenhum evento', async () => {
    const id = await pronto();
    ctx!.ports.anuncio = {
      slack: new InMemoryAnuncio({ failSlack: true }),
      jira: new InMemoryAnuncio({ failJira: true }),
    };
    const res = await anunciar(id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ slack: { status: 'falhou' }, jira: { status: 'falhou' } });
    expect((await events(id)).filter((e) => e.type === 'experiment.announced')).toHaveLength(0);
  });
});

describe('clientes Slack e Jira', () => {
  const calls: { url: string; init: Parameters<FetchLike>[1] }[] = [];
  const fakeFetch =
    (status: number, body = '{}'): FetchLike =>
    async (url, init) => {
      calls.push({ url, init });
      return { ok: status < 400, status, text: async () => body };
    };
  beforeEach(() => calls.splice(0));

  it('Slack: POST JSON {text} no webhook; erro HTTP vira exceção', async () => {
    await slackWebhook('https://hooks.slack.com/services/x', fakeFetch(200), '#canal').post('olá');
    expect(calls[0]!.url).toBe('https://hooks.slack.com/services/x');
    expect(JSON.parse(calls[0]!.init.body!)).toEqual({ text: 'olá', channel: '#canal' });
    await expect(
      slackWebhook('https://hooks.slack.com/services/x', fakeFetch(500)).post('olá'),
    ).rejects.toThrow('500');
  });

  it('Jira: cria issue na API v2 com basic auth e devolve chave + link', async () => {
    const jira = jiraRest(
      {
        baseUrl: 'https://petlove.atlassian.net/',
        email: 'a@b.c',
        apiToken: 't',
        projectKey: 'EXP',
      },
      fakeFetch(201, '{"key":"EXP-7"}'),
    );
    expect(await jira.createIssue({ summary: 'S', description: 'D' })).toEqual({
      key: 'EXP-7',
      url: 'https://petlove.atlassian.net/browse/EXP-7',
    });
    expect(calls[0]!.url).toBe('https://petlove.atlassian.net/rest/api/2/issue');
    expect(calls[0]!.init.headers.authorization).toBe(
      `Basic ${Buffer.from('a@b.c:t').toString('base64')}`,
    );
    expect(JSON.parse(calls[0]!.init.body!)).toEqual({
      fields: {
        project: { key: 'EXP' },
        issuetype: { name: 'Task' },
        summary: 'S',
        description: 'D',
      },
    });
    const semChave = jiraRest(
      { baseUrl: 'https://x.atlassian.net', email: 'e', apiToken: 't', projectKey: 'P' },
      fakeFetch(201, '{}'),
    );
    await expect(semChave.createIssue({ summary: 'S', description: 'D' })).rejects.toThrow('chave');
    const negado = jiraRest(
      { baseUrl: 'https://x.atlassian.net', email: 'e', apiToken: 't', projectKey: 'P' },
      fakeFetch(401),
    );
    await expect(negado.createIssue({ summary: 'S', description: 'D' })).rejects.toThrow('401');
  });

  it('Slack por bot: resolve e-mails em menções e posta no canal; quem não existe fica sem marcação', async () => {
    const f: FetchLike = async (url, init) => {
      calls.push({ url, init });
      if (url.includes('users.lookupByEmail'))
        return {
          ok: true,
          status: 200,
          text: async () =>
            url.includes('pm%40')
              ? '{"ok":true,"user":{"id":"U1"}}'
              : '{"ok":false,"error":"users_not_found"}',
        };
      return { ok: true, status: 200, text: async () => '{"ok":true}' };
    };
    const r = await slackBot({ token: 'xoxb-1', channel: '#testes-ab' }, f).post(
      '*Quem:* Ecom · pm@x.com',
      {
        mentionEmails: ['pm@x.com', 'ninguem@x.com', 'pm@x.com'],
      },
    );
    expect(r).toEqual({ channel: '#testes-ab' });
    const post = calls.find((c) => c.url.endsWith('chat.postMessage'))!;
    expect(post.init.headers.authorization).toBe('Bearer xoxb-1');
    expect(JSON.parse(post.init.body!)).toMatchObject({
      channel: '#testes-ab',
      text: '*Quem:* Ecom · <@U1>', // no lugar do e-mail
    });
    expect(calls.filter((c) => c.url.includes('users.lookupByEmail'))).toHaveLength(2);
    calls.splice(0);
    const f2: FetchLike = async (url, init) => {
      calls.push({ url, init });
      if (url.includes('users.lookupByEmail'))
        return { ok: true, status: 200, text: async () => '{"ok":true,"user":{"id":"U9"}}' };
      return { ok: true, status: 200, text: async () => '{"ok":true}' };
    };
    await slackBot({ token: 'xoxb-1', channel: '#testes-ab' }, f2).post('texto', {
      mentionEmails: ['lider@x.com'],
    });
    expect(JSON.parse(calls.find((c) => c.url.endsWith('chat.postMessage'))!.init.body!).text).toBe(
      '<@U9> texto',
    ); // não citado: prefixo
    const recusado: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: async () => '{"ok":false,"error":"channel_not_found"}',
    });
    await expect(slackBot({ token: 'xoxb-1', channel: '#x' }, recusado).post('t')).rejects.toThrow(
      'channel_not_found',
    );
  });

  it('ambiente: cada destino só existe com suas variáveis; bot tem prioridade sobre webhook', () => {
    expect(anuncioPortsFromEnv({})).toEqual({});
    expect(
      Object.keys(
        anuncioPortsFromEnv({
          FARO_SLACK_BOT_TOKEN: 'xoxb',
          FARO_SLACK_CHANNEL: '#testes-ab',
          FARO_SLACK_WEBHOOK_URL: 'https://hooks.slack.com/x',
        }),
      ),
    ).toEqual(['slack']);
    expect(anuncioPortsFromEnv({ FARO_SLACK_BOT_TOKEN: 'xoxb' })).toEqual({}); // bot sem canal não vale
    expect(extraMentions({ FARO_SLACK_MENTIONS: 'a@x.com, b@x.com,' })).toEqual([
      'a@x.com',
      'b@x.com',
    ]);
    expect(extraMentions({})).toEqual([]);
    expect(
      Object.keys(anuncioPortsFromEnv({ FARO_SLACK_WEBHOOK_URL: 'https://hooks.slack.com/x' })),
    ).toEqual(['slack']);
    expect(
      Object.keys(
        anuncioPortsFromEnv({
          FARO_JIRA_BASE_URL: 'https://x.atlassian.net',
          FARO_JIRA_EMAIL: 'e',
          FARO_JIRA_API_TOKEN: 't',
          FARO_JIRA_PROJECT_KEY: 'P',
        }),
      ),
    ).toEqual(['jira']);
    expect(
      anuncioPortsFromEnv({ FARO_JIRA_BASE_URL: 'https://x.atlassian.net', FARO_JIRA_EMAIL: 'e' }),
    ).toEqual({});
  });
});
