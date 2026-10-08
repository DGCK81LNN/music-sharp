<script setup lang="ts">
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()
</script>

<template>
  <BOffcanvas
    id="global-settings"
    title="全局设置"
    placement="end"
    body-class="p-3"
  >
    <BFormCheckbox v-model="settings.collapseInactive" class="mb-2">
      播放时自动折叠「未开始/已结束」的音轨
    </BFormCheckbox>
    <BFormCheckbox v-model="settings.autoScroll">
      播放时自动滚动到正在发声的音符
    </BFormCheckbox>
  </BOffcanvas>
</template>
