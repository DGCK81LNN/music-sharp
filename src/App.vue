<script setup lang="ts">
import TopBar from './components/TopBar.vue'
import TrackList from './components/TrackList.vue'
import TransportBar from './components/TransportBar.vue'
import TrackSettingsPanel from './components/TrackSettingsPanel.vue'
import GlobalSettings from './components/GlobalSettings.vue'
</script>

<template>
  <BApp>
    <div class="app-shell d-flex flex-column min-vh-100">
      <TopBar />
      <main class="flex-grow-1">
        <TrackList />
      </main>
      <TransportBar />
      <TrackSettingsPanel />
      <GlobalSettings />
    </div>
  </BApp>
</template>
