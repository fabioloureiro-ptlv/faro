// E8 — nenhum identificador de usuário ou sessão sai no snapshot. As consultas já agregam; isto é a trava.
export const FORBIDDEN_KEY = /^(dyid|guid|cuid|user_pseudo_id|session_id|dy_session_id|email|cpf|public_id|cod_usuario|user_id|client_id)/i;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;

export function privacyViolations(rows: Record<string, unknown>[], label = ''): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    for (const [k, v] of Object.entries(r)) {
      if (FORBIDDEN_KEY.test(k)) out.add(`${label}${k}: coluna de identificador`);
      if (typeof v === 'string' && EMAIL.test(v)) out.add(`${label}${k}: valor parece e-mail`);
    }
  }
  return [...out];
}
