<script setup lang="ts">
import { useSessionStore } from '../stores/session'
import TrackCard from './TrackCard.vue'

const store = useSessionStore()
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
    <BButton variant="outline-primary" class="w-100 mt-1" @click="store.addTrack()">
      ＋ 添加音轨
    </BButton>
  </div>
</template>
