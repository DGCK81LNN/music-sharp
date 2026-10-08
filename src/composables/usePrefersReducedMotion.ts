import { onMounted, onUnmounted, ref } from 'vue'

/** 响应系统的「减少动态效果」偏好（用于滚动/折叠动画）。 */
export function usePrefersReducedMotion() {
  const reduced = ref(false)
  let mq: MediaQueryList | null = null

  const update = () => {
    reduced.value = mq ? mq.matches : false
  }

  onMounted(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      update()
      mq.addEventListener('change', update)
    }
  })

  onUnmounted(() => {
    mq?.removeEventListener('change', update)
  })

  return reduced
}
