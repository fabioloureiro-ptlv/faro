// Clientes do aviso (Slack por Incoming Webhook; Jira Cloud pela REST API v2). Nenhum token vive no
// código: tudo vem do ambiente (FARO_SLACK_WEBHOOK_URL, FARO_JIRA_*). Sem a variável, o canal
// correspondente fica "não configurado" e o aviso segue pelos outros.
export interface SlackPostOptions {
  /** E-mails de quem deve ser marcado (o PM que preencheu o teste e quem mais o ambiente listar). */
  mentionEmails?: string[];
}

export interface SlackPort {
  post(text: string, opts?: SlackPostOptions): Promise<{ channel?: string }>;
}

export interface JiraPort {
  createIssue(input: {
    summary: string;
    description: string;
  }): Promise<{ key: string; url: string }>;
}

export interface AnuncioPorts {
  slack?: SlackPort;
  jira?: JiraPort;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export function slackWebhook(
  webhookUrl: string,
  fetchFn: FetchLike = fetch as unknown as FetchLike,
  channel?: string,
): SlackPort {
  return {
    async post(text) {
      const res = await fetchFn(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, ...(channel ? { channel } : {}) }),
      });
      if (!res.ok) throw new Error(`Slack respondeu ${res.status}`);
      return channel ? { channel } : {};
    },
  };
}

/**
 * Slack por app com token de bot (`xoxb-…`, escopos chat:write e users:read.email): posta no canal
 * e marca pessoas pelo e-mail (users.lookupByEmail). Quem não for encontrado fica sem marcação, sem erro.
 */
export function slackBot(
  cfg: { token: string; channel: string },
  fetchFn: FetchLike = fetch as unknown as FetchLike,
): SlackPort {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    authorization: `Bearer ${cfg.token}`,
  };
  async function lookup(email: string): Promise<string | undefined> {
    try {
      const res = await fetchFn(
        `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
        { method: 'GET', headers },
      );
      if (!res.ok) return undefined;
      const body = JSON.parse(await res.text()) as { ok?: boolean; user?: { id?: string } };
      return body.ok ? body.user?.id : undefined;
    } catch {
      return undefined;
    }
  }
  return {
    async post(text, opts = {}) {
      // E-mail citado no texto (ex.: "Quem: … · pm@x.com") vira a menção no mesmo lugar; quem não é citado
      // entra como prefixo. E-mail sem usuário no Slack fica como está.
      let body = text;
      const prefix: string[] = [];
      for (const email of [...new Set(opts.mentionEmails ?? [])]) {
        const id = await lookup(email);
        if (!id) continue;
        if (body.includes(email)) body = body.split(email).join(`<@${id}>`);
        else prefix.push(`<@${id}>`);
      }
      if (prefix.length) body = `${prefix.join(' ')} ${body}`;
      const res = await fetchFn('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers,
        body: JSON.stringify({ channel: cfg.channel, text: body, unfurl_links: false }),
      });
      if (!res.ok) throw new Error(`Slack respondeu ${res.status}`);
      const reply = JSON.parse(await res.text()) as { ok?: boolean; error?: string };
      if (!reply.ok) throw new Error(`Slack recusou: ${reply.error ?? 'erro desconhecido'}`);
      return { channel: cfg.channel };
    },
  };
}

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
  issueType?: string;
}

export function jiraRest(
  cfg: JiraConfig,
  fetchFn: FetchLike = fetch as unknown as FetchLike,
): JiraPort {
  const base = cfg.baseUrl.replace(/\/$/, '');
  const auth = `Basic ${Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString('base64')}`;
  return {
    async createIssue({ summary, description }) {
      const res = await fetchFn(`${base}/rest/api/2/issue`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: auth,
        },
        body: JSON.stringify({
          fields: {
            project: { key: cfg.projectKey },
            issuetype: { name: cfg.issueType ?? 'Task' },
            summary,
            description,
          },
        }),
      });
      if (!res.ok) throw new Error(`Jira respondeu ${res.status}`);
      const body = JSON.parse(await res.text()) as { key?: string };
      if (!body.key) throw new Error('Jira não devolveu a chave do card');
      return { key: body.key, url: `${base}/browse/${body.key}` };
    },
  };
}

/** Guarda o que seria enviado; usado em testes e quando se quer ver a mensagem sem enviar. */
type InMemoryOpts = {
  channel?: string;
  jiraBase?: string;
  failSlack?: boolean;
  failJira?: boolean;
};

export class InMemoryAnuncio implements SlackPort, JiraPort {
  readonly slackPosts: string[] = [];
  readonly slackMentions: string[][] = [];
  readonly jiraIssues: { summary: string; description: string }[] = [];
  readonly opts: InMemoryOpts;
  constructor(opts: InMemoryOpts = {}) {
    this.opts = opts;
  }
  async post(text: string, opts: SlackPostOptions = {}) {
    if (this.opts.failSlack) throw new Error('slack indisponível');
    this.slackPosts.push(text);
    this.slackMentions.push(opts.mentionEmails ?? []);
    return this.opts.channel ? { channel: this.opts.channel } : {};
  }
  async createIssue(input: { summary: string; description: string }) {
    if (this.opts.failJira) throw new Error('jira indisponível');
    this.jiraIssues.push(input);
    const key = `FARO-${this.jiraIssues.length}`;
    return { key, url: `${this.opts.jiraBase ?? 'https://jira.example.com'}/browse/${key}` };
  }
}

export function anuncioPortsFromEnv(env: NodeJS.ProcessEnv = process.env): AnuncioPorts {
  const out: AnuncioPorts = {};
  if (env.FARO_SLACK_WEBHOOK_URL)
    out.slack = slackWebhook(
      env.FARO_SLACK_WEBHOOK_URL,
      undefined,
      env.FARO_SLACK_CHANNEL || undefined,
    );
  if (
    env.FARO_JIRA_BASE_URL &&
    env.FARO_JIRA_EMAIL &&
    env.FARO_JIRA_API_TOKEN &&
    env.FARO_JIRA_PROJECT_KEY
  )
    out.jira = jiraRest({
      baseUrl: env.FARO_JIRA_BASE_URL,
      email: env.FARO_JIRA_EMAIL,
      apiToken: env.FARO_JIRA_API_TOKEN,
      projectKey: env.FARO_JIRA_PROJECT_KEY,
      issueType: env.FARO_JIRA_ISSUE_TYPE || undefined,
    });
  return out;
}

/** E-mails extras a marcar em todo aviso (FARO_SLACK_MENTIONS, separados por vírgula). */
export function extraMentions(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.FARO_SLACK_MENTIONS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
