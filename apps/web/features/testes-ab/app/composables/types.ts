// Formas devolvidas por /testes-ab/* (services/api/src/testes-ab).
export type Formato = 'brl' | 'pct' | 'num' | 'num4' | 'int';
export type TomSig = 'good' | 'good-outline' | 'neutral' | 'warn' | 'bad';
export type Grao = 'usuario' | 'sessao';
export type StreamFiltro = 'todos' | 'web' | 'app';

export interface Sig {
  seta: '▲' | '▼' | '—';
  rotulo: string;
  p: number;
  tom: TomSig;
}

export interface Comparacao {
  uplift: number;
  low: number | null;
  high: number | null;
  p: number | null;
  confirmado: boolean;
  sig: Sig | null;
}

export interface StatusDy {
  key: 'saudavel' | 'split_desigual' | 'volume_baixo' | 'decidido';
  rotulo: string;
  tom: 'good' | 'warn' | 'neutral' | 'muted';
  dica: string;
}

export interface Resumo {
  disponivel: boolean;
  dadosAte: string | null;
  buscadoEm: string | null;
  fonte: string;
  contagens: { roadmap: number; dy: number };
}

export type StatusRoadmap = 'desenhando' | 'pronto' | 'rodando' | 'concluido';

export interface TesteRoadmap {
  id: number;
  nome: string;
  status: StatusRoadmap;
  dataInicio?: string;
  indicador?: string;
  squad?: string;
  iniciativa?: string;
  campanhasDy: string[];
  campanhasRelacionadas?: string[];
  cenarios?: { nome: string; descricao: string; rollout?: boolean }[];
  contexto?: string;
  documentacao?: string;
  temAcompanhamento?: boolean;
  resumo?: string;
  decisao?: { variante: string; data: string };
  midias?: number;
  diasEmCampo?: number;
  avisos: string[];
  dy: { atrelado: boolean; campanhas: string[]; resultado?: { campanha: string; stream: 'web' | 'app'; variante: string; metrica: string; cmp: Comparacao } };
}

export interface RoadmapView {
  contadores: Record<StatusRoadmap, number>;
  indicadores: { rotulo: string; quantidade: number }[];
  testes: TesteRoadmap[];
}

export interface LinhaDy {
  key: string;
  campanha: string;
  stream: 'web' | 'app';
  bu: string | null;
  cross: boolean;
  base: number;
  unidade: 'usuários' | 'sessões';
  split: string;
  status: StatusDy;
  variantes: number;
  controle: number | null;
  melhor: { nome: string; valor: number | null } | null;
  cmp: Comparacao | null;
  roadmap: { atrelados: number[]; relacionados: number[] };
}

export interface ListaDy {
  grao: Grao;
  stream: StreamFiltro;
  metrica: { key: string; label: string; formato: Formato };
  kpis: { testes: number; splitValido: number; decididosLigados: number; confirmados: number };
  statusContagem: Record<StatusDy['key'], number>;
  testes: LinhaDy[];
  metricas: { key: string; label: string }[];
  dadosAte: string;
}

export interface Celula {
  valor: number | null;
  uplift?: number | null;
  sig?: Sig | null;
}

export interface LinhaTabela {
  chave: string;
  rotulo: string;
  grupo: 'volume' | 'ecom' | 'clube' | 'saude';
  formato: Formato;
  papel?: 'norte' | 'guarda' | 'exploratoria';
  celulas: Celula[];
}

export interface DetalheDy {
  key: string;
  campanha: string;
  stream: 'web' | 'app';
  bu: string | null;
  cross: boolean;
  grao: Grao;
  unidade: 'usuários' | 'sessões';
  dadosAte: string | null;
  status: StatusDy;
  squad?: string;
  objetivo?: string;
  excluidos: { quantidade: number; percentual: number } | null;
  leitura: { inicio: string | null; fim: string | null; dias: number | null; origem: string | null };
  norte: { key: string; label: string };
  variantes: { nome: string; controle: boolean; share: number | null; descricao?: string }[];
  sintese: { variante: string; itens: { rotulo: string; norte: boolean; uplift: number | null; sig: Sig | null }[] }[];
  recomendacao: { titulo: string; texto: string; tom: 'ok' | 'warn' | 'risk' | 'info' };
  tabelas: { device: string; rotulo: string; variantes: string[]; linhas: LinhaTabela[] }[];
  mde: { variantes: string[]; linhas: { rotulo: string; norte: boolean; valores: (number | null)[] }[] };
  roadmap: { atrelados: number[]; relacionados: number[] };
}

export interface Consulta {
  id: 'results' | 'discovery' | 'daily';
  nome: string;
  arquivo: string;
  custo: string;
  descricao: string;
  salva: boolean;
  ultimaExecucao: { geradoEm: string; linhas: number | null; dadosAte: string; versao: string | null } | null;
}

export interface ConsultasView {
  consultas: Consulta[];
  injetado: { campanha: string; inicio: string | null; fim: string | null; controle: string | null; norte: string; teste: number; testeNome: string | null }[];
}
