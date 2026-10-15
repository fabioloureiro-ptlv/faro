<script setup lang="ts">
import type { ExperimentStatus } from '@faro/contracts';
import { STATUS_LABEL } from '../utils/labels';

defineProps<{ status: ExperimentStatus }>();
</script>

<template>
  <span class="pill" :class="STATUS_LABEL[status][1]">{{ STATUS_LABEL[status][0] }}</span>
</template>
