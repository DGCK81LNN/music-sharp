import { ref } from 'vue'

/** 音轨属性弹窗的可见状态，供音轨卡片与弹窗组件共享。 */
export const trackSettingsVisible = ref(false)

export function openTrackSettings(): void {
  trackSettingsVisible.value = true
}
