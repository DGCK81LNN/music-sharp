import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { BootstrapVueNextResolver } from 'bootstrap-vue-next/resolvers'

// https://vitejs.dev/config/
export default defineConfig({
  // 使用相对路径引用产物，便于部署到任意子目录或用 file:// 直接打开
  base: './',
  plugins: [
    vue(),
    // 自动按需引入 bootstrap-vue-next 的组件与指令（v1.x 组件不再由插件全局注册）
    Components({
      dts: 'src/components.d.ts',
      resolvers: [BootstrapVueNextResolver({ components: true, directives: true })],
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
})

