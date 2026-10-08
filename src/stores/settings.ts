import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const KEY = 'music-sharp-settings'

interface Stored {
  collapseInactive: boolean
  autoScroll: boolean
}

function load(): Stored {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (raw) {
      const o = JSON.parse(raw) as Partial<Stored>
      return {
        collapseInactive: !!o.collapseInactive,
        autoScroll: o.autoScroll !== false,
      }
    }
  } catch {
    /* 忽略 */
  }
  return { collapseInactive: false, autoScroll: true }
}

export const useSettingsStore = defineStore('settings', () => {
  const initial = load()
  const collapseInactive = ref(initial.collapseInactive)
  const autoScroll = ref(initial.autoScroll)

  watch([collapseInactive, autoScroll], () => {
    try {
      globalThis.localStorage?.setItem(
        KEY,
        JSON.stringify({
          collapseInactive: collapseInactive.value,
          autoScroll: autoScroll.value,
        }),
      )
    } catch {
      /* 忽略 */
    }
  })

  return { collapseInactive, autoScroll }
})
