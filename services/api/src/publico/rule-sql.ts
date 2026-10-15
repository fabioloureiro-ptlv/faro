// Frente 3 — geração de SQL BigQuery a partir de AudienceRule (SEG-03/05).
// Regras do contexto geral: toda janela temporal vira `BETWEEN` fechado (nunca
// `refdate <= X`), e a saída é SEMPRE 1 linha por cliente (`chv_cliente`).
// O custo é validado por dry run antes de executar (SEG-05, orçamento).
import type { AudienceCondition, AudienceRule } from '@faro/contracts';

export const PROJECT = 'petlove-dataeng-prod-01';

/** Propriedades de usuário mapeadas na dim_cliente (pergunta aberta 1 do spec: demais fontes a descobrir). */
const PROPERTY_SQL: Record<string, (values: string[], op: 'eq' | 'in' | 'neq') => string> = {
  clube: (_v, op) => `fl_clube ${op === 'neq' ? '=' : '='} ${op === 'neq' ? 0 : 1}`,
  plano_saude: (_v, op) => `fl_plano_ativo_saude ${op === 'neq' ? '=' : '='} ${op === 'neq' ? 0 : 1}`,
  especie_pet: (values, op) => {
    const cols: Record<string, string> = {
      cachorro: 'pet_cachorro',
      gato: 'pet_gato',
      passaro: 'pet_passaro',
      roedor: 'pet_roedor',
      reptil: 'pet_reptil',
      peixe: 'pet_peixes',
    };
    const terms = values.map((v) => {
      const col = cols[v.toLowerCase()];
      if (!col) throw new Error(`espécie não mapeada: ${v}`);
      return `${col} = 'Sim'`;
    });
    const joined = terms.join(' OR ');
    return op === 'neq' ? `NOT (${joined})` : `(${joined})`;
  },
};

// Barra primeiro: um valor terminado em `\` ou com `\'` fecharia o literal e injetaria SQL.
const esc = (s: string) => s.replaceAll('\\', '\\\\').replaceAll("'", "\\'");

function conditionSql(c: AudienceCondition): string {
  switch (c.type) {
    case 'comprou': {
      const col = { categoria: 'p.site_categoria', marca: 'p.site_marca', item: 'p.chv_produto' }[c.dimension];
      const match =
        c.dimension === 'item'
          ? `${col} IN (${c.values.map((v) => `'${esc(v)}'`).join(', ')})`
          : `(${c.values.map((v) => `LOWER(${col}) LIKE '%${esc(v.toLowerCase())}%'`).join(' OR ')})`;
      return `chv_cliente IN (
  SELECT f.chv_cliente
  FROM \`${PROJECT}.dw_corporativo.ft_pedido_faturado\` f
  JOIN \`${PROJECT}.dw_corporativo.dim_produto\` p USING (chv_produto)
  WHERE DATE(f.timestamp_data_captado) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL ${c.windowDays} DAY) AND CURRENT_DATE()
    AND f.chv_cliente IS NOT NULL AND ${match}
)`;
    }
    case 'evento': {
      const having = c.minCount && c.minCount > 1 ? `\n  HAVING COUNT(*) >= ${c.minCount}` : '';
      // Eventos GA4 são por user_pseudo_id; o vínculo com chv_cliente depende do id
      // unificado (pergunta aberta do spec). Interino: user_id do GA4 = public_id.
      return `chv_cliente IN (
  SELECT c.chv_cliente
  FROM \`${PROJECT}.ssot_ga4.events\` e
  JOIN \`${PROJECT}.dw_corporativo.dim_cliente\` c ON c.public_id = e.user_id
  WHERE e.refdate BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL ${c.windowDays} DAY) AND CURRENT_DATE()
    AND e.event_name = '${esc(c.eventName)}' AND e.user_id IS NOT NULL
  GROUP BY 1${having}
)`;
    }
    case 'propriedade': {
      const fn = PROPERTY_SQL[c.key];
      if (fn) return fn(c.values, c.op);
      throw new Error(`propriedade sem fonte mapeada: ${c.key} (registrar em PEDIDOS.md)`);
    }
    case 'plataforma':
      // Plataforma é filtro de ativação (allocation), não de base de clientes.
      return 'TRUE /* plataforma: aplicada na alocação, não na base */';
  }
}

function ruleSql(rule: AudienceRule): string {
  // 'conditions' distingue regra aninhada de condição ('propriedade' também tem campo 'op').
  const parts = rule.conditions.map((c) =>
    'conditions' in c ? `(${ruleSql(c as AudienceRule)})` : conditionSql(c as AudienceCondition),
  );
  return parts.join(rule.op === 'and' ? '\n  AND ' : '\n  OR ');
}

/**
 * SQL completo do público: 1 linha por cliente com `chv_cliente` e `cuid`
 * (`public_id`, o identificador que o DY reconhece — cadeia validada no
 * segmentacao-ab: public_id = cuid dos eventos "Identify User").
 */
export function audienceRuleToSql(rule: AudienceRule): string {
  return `SELECT chv_cliente, public_id AS cuid
FROM \`${PROJECT}.dw_corporativo.dim_cliente\`
WHERE public_id IS NOT NULL
  AND ${ruleSql(rule)}`;
}
