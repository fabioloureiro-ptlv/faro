import type { FastifyRequest } from 'fastify';
import { HttpError } from './errors.ts';

const ACTOR = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** DECISAO-PENDENTE: identidade pelo header x-faro-user até existir SSO. */
export function requireActor(req: FastifyRequest): string {
  const v = req.headers['x-faro-user'];
  const actor = Array.isArray(v) ? v[0] : v;
  if (!actor || !ACTOR.test(actor)) throw new HttpError(401, 'sem_identidade', 'Informe o usuário no header x-faro-user.');
  return actor.toLowerCase();
}
