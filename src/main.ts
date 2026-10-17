import { createApp } from 'vue'
import { createBootstrap } from 'bootstrap-vue-next'
import { createPinia } from 'pinia'
import App from './App.vue'

import './styles/main.css'

createApp(App).use(createPinia()).use(createBootstrap()).mount('#app')
