<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Decision, Experiment } from '@faro/contracts';
import type { ClosingChecklist } from '@faro/api/experiments/status';
import type { DetailActions } from '../../domain';
import { DECISION_TEMPLATE } from '../../mocks/decision-template';

const props = defineProps<{
  experiment: Experiment;
  actions: DetailActions;
  closing?: ClosingChecklist;
}>();
const emit = defineEmits<{ changed: [] }>();

const outcome = ref<Decision['outcome'] | ''>('');
const rationale = ref('');
const learningUrl = ref('');
const sending = ref(false);
const error = ref('');

const urlOk = computed(() => /^https:\/\/\S+$/.test(learningUrl.value.trim()));
const items = computed(() =>
  (props.closing?.items ?? []).map((i) =>
    // O link digitado ainda não foi gravado: reflete na hora, o servidor valida de novo.
    i.id === 'aprendizado' && urlOk.value ? { ...i, done: true, detail: 'Link informado.' } : i,
  ),
);
const canSubmitClose = computed(() => props.actions.canClose && items.value.every((i) => i.done));

async function post(path: string, body: Record<string, string>) {
  sending.value = true;
  error.value = '';
  try {
    // Unificação: comandos vão para a API Fastify, que persiste no banco.
    const cfg = useRuntimeConfig().public;
    await $fetch(`${cfg.apiBase}/experiments/${props.experiment.faroId}/${path}`, {
      method: 'POST',
      body,
      headers: { 'x-faro-user': cfg.faroUser as string },
    });
    emit('changed');
  } catch (e) {
    const err = e as { data?: { message?: string } };
    error.value = err.data?.message ?? 'Não foi possível salvar. Tente de novo.';
  } finally {
    sending.value = false;
  }
}

const decide = () => post('decision', { outcome: outcome.value, rationale: rationale.value });
const close = () => post('close', { learningUrl: learningUrl.value.trim() });

const noPermission = computed(() =>
  props.actions.actor
    ? 'Só o squad dono ou o time de experimentação podem fazer isto neste teste.'
    : 'Autenticação não configurada: ações de escrita indisponíveis.',
);
</script>

<template>
  <section
    v-if="experiment.status === 'rodando' || experiment.status === 'decidido'"
    class="bloco"
    aria-labelledby="acoes-titulo"
  >
    <template v-if="experiment.status === 'rodando'">
      <h2 id="acoes-titulo">Registrar decisão</h2>
      <p v-if="!actions.canDecide" class="vazio">{{ noPermission }}</p>
      <form v-else @submit.prevent="decide">
        <fieldset>
          <legend>Resultado</legend>
          <label v-for="o in DECISION_TEMPLATE.outcomes" :key="o.value" class="opcao">
            <input v-model="outcome" type="radio" name="outcome" :value="o.value" required />
            <span>
              <strong>{{ o.label }}</strong>
              <small>{{ o.hint }}</small>
            </span>
          </label>
        </fieldset>
        <label class="campo">
          <span>Justificativa</span>
          <textarea v-model="rationale" rows="5" maxlength="4000" required />
          <small>
            Responda:
            <template v-for="(p, i) in DECISION_TEMPLATE.rationalePrompts" :key="p">{{ i ? ' ' : '' }}{{ p }}</template>
          </small>
        </label>
        <p class="quem">Registrado por {{ actions.actor }} com a data de hoje.</p>
        <p v-if="error" role="alert" class="erro">{{ error }}</p>
        <button type="submit" :disabled="sending || !outcome || !rationale.trim()">
          {{ sending ? 'Salvando…' : 'Registrar decisão' }}
        </button>
      </form>
    </template>

    <template v-else>
      <h2 id="acoes-titulo">Encerramento</h2>
      <ul class="checklist">
        <li v-for="i in items" :key="i.id" :class="{ ok: i.done }">
          <span class="marca" aria-hidden="true">{{ i.done ? '✓' : '○' }}</span>
          <span>
            <strong>{{ i.label }}</strong>
            <span class="sr-only">{{ i.done ? '(feito)' : '(pendente)' }}</span>
            <small>{{ i.detail }}</small>
          </span>
        </li>
      </ul>
      <p v-if="!actions.canClose" class="vazio">{{ noPermission }}</p>
      <form v-else @submit.prevent="close">
        <label class="campo">
          <span>Link do aprendizado publicado</span>
          <input
            v-model="learningUrl"
            type="url"
            inputmode="url"
            placeholder="https://"
            maxlength="2000"
            required
          />
        </label>
        <p v-if="error" role="alert" class="erro">{{ error }}</p>
        <button type="submit" :disabled="sending || !canSubmitClose">
          {{ sending ? 'Encerrando…' : 'Encerrar teste' }}
        </button>
      </form>
    </template>
  </section>
</template>

<style scoped>
.bloco {
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 4px solid var(--brand);
  border-radius: var(--radius);
  padding: 16px 18px;
}
h2 {
  margin: 0 0 10px;
  font-size: 18px;
}
fieldset {
  border: 0;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
legend,
.campo > span {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 4px;
}
.opcao {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  cursor: pointer;
}
.opcao input {
  margin-top: 4px;
}
.opcao small,
.campo small,
.checklist small {
  display: block;
  color: var(--muted);
  font-size: 12.5px;
}
.campo {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}
textarea,
input[type='url'] {
  border: 1px solid var(--line);
  background: var(--bg);
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  resize: vertical;
}
.quem {
  font-size: 12.5px;
  color: var(--muted);
  margin: 0 0 10px;
  overflow-wrap: anywhere;
}
button {
  border: 0;
  background: var(--brand);
  color: var(--on-brand);
  border-radius: 8px;
  padding: 9px 16px;
  font-weight: 700;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.erro {
  color: var(--risk);
  margin: 0 0 10px;
}
.vazio {
  color: var(--muted);
  margin: 0;
}
.checklist {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.checklist li {
  display: flex;
  gap: 8px;
}
.marca {
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
  border: 1.5px solid var(--muted);
  color: var(--muted);
}
.ok .marca {
  background: var(--ok);
  border-color: var(--ok);
  color: var(--surface);
}
</style>
