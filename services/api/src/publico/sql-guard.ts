// Frente 3 — validação estática do SQL livre de um segmento. A única exigência de forma é
// o grão: uma linha por indivíduo, com `cuid`. Aqui só se barra o que nunca pode virar
// segmento (comando que escreve, script com vários comandos, coluna cuid ausente);
// o resto (colunas existem, custo, unicidade) quem confere é o dry run e a contagem.

/** Remove comentários e literais/identificadores entre aspas, para não confundir palavras-chave. */
export function stripSqlNoise(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`[^`]*`/g, ' ');
}

const FORBIDDEN = /\b(insert|update|delete|merge|drop|create|alter|truncate|grant|revoke|call|execute|export|load|declare|begin|assert)\b/i;

/** Devolve a mensagem do primeiro problema, ou null se o SQL pode seguir. */
export function guardAudienceSql(sql: string): string | null {
  const body = stripSqlNoise(sql).trim().replace(/;\s*$/, '');
  if (!body) return 'O SQL está vazio.';
  if (body.includes(';')) return 'Só é permitido um comando por segmento.';
  if (!/^(select|with)\b/i.test(body)) return 'O SQL precisa começar com SELECT ou WITH.';
  const bad = FORBIDDEN.exec(body);
  if (bad) return `Comando não permitido num segmento: ${bad[1]!.toUpperCase()}.`;
  if (!/\bcuid\b/i.test(body)) return 'A query precisa devolver a coluna cuid (uma linha por cliente).';
  return null;
}
