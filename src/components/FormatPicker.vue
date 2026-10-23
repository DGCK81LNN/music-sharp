<script setup lang="ts">
import { computed, type RendererElement } from 'vue'
import { formats } from '../formats/registry'

const props = defineProps<{
  modelValue: string
  disabled?: boolean
  size?: 'sm' | 'lg'
  teleportTo?: string | RendererElement | null
}>()

const emit = defineEmits<{
  'update:modelValue': [format: string]
}>()

const selectedFormat = computed(
  () => formats.find((format) => format.id === props.modelValue) ?? formats[0],
)
</script>

<template>
  <BDropdown
    :text="selectedFormat.name"
    :disabled="disabled"
    :size="size"
    variant="outline-secondary"
    placement="bottom-start"
    :teleport-to
    menu-class="format-picker-menu"
    toggle-class="w-100 d-flex align-items-center justify-content-between text-start"
    aria-label="选择乐谱格式"
  >
    <BDropdownItemButton
      v-for="format in formats"
      :key="format.id"
      :active="format.id === selectedFormat.id"
      class="format-picker-option"
      @click="emit('update:modelValue', format.id)"
    >
      <span class="d-flex align-items-center justify-content-between gap-3">
        <span class="fw-semibold">{{ format.name }}</span>
        <IBiCheck2 v-if="format.id === selectedFormat.id" aria-hidden="true" />
      </span>
      <span
        class="d-block small text-wrap"
        :class="format.id === selectedFormat.id ? 'text-white-50' : 'text-body-secondary'"
      >
        {{ format.description }}
      </span>
    </BDropdownItemButton>
  </BDropdown>
</template>

<style scoped>
:deep(.format-picker-menu) {
  width: min(22rem, calc(100vw - 3rem));
}

.format-picker-option {
  white-space: normal;
}
</style>