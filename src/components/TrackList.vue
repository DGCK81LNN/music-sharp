<script setup lang="ts">
import { useSessionStore } from '../stores/session'
import { usePlaybackStore } from '../stores/playback'
import TrackCard from './TrackCard.vue'

const store = useSessionStore()
const playback = usePlaybackStore()
</script>

<template>
  <div class="track-list p-2">
    <p v-if="store.tracks.length === 0" class="text-muted text-center py-4">
      还没有音轨，点击下方按钮开始创作。
    </p>
    <TrackCard
      v-for="(t, i) in store.tracks"
      :key="t.id"
      :track="t"
      :index="i"
      :total="store.tracks.length"
    />
    <BButton
      v-if="!playback.playing"
      variant="info"
      class="w-100 mt-1 d-inline-flex align-items-center justify-content-center gap-1"
      @click="store.addTrack()"
    >
      <IBiPlusLg />
      添加音轨
    </BButton>
  </div>
</template>
