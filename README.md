# music-sharp · 多轨音乐编辑器

一个移动端优先的网页应用，用于把多种乐谱语法编写的音轨自由组合成一首多轨乐曲，支持即时播放、进度跳转、发声音符高亮与自动滚动，并可导入/导出多轨会话为 JSON。

底层基于 [musicjs](https://wiki.xdi8.top/index.php?title=LNNBot/指令/musicjs&oldid=45010 "LNNBot/指令/musicjs - 希顶维基") 的音符模型（`note` / `noteJust` / `noteHz` / `rest` + `bpm` / `baseFrequency` / `gain` / `time`），本项目把 `aj`、`ip7`、`Tr3` 三种[乐谱语法](https://wiki.xdi8.top/index.php?title=LNNBot/指令/musicjs*&oldid=45372#用法 "LNNBot/指令/musicjs*#用法 - 希顶维基")移植为带**源码位置追踪**的可读 TypeScript 模块，从而支持在源码里实时高亮正在发声的音符。语法插件化，便于后续增加新的记谱方式。

## 功能特性

- 🎼 **多轨组合**：自由增删、排序、重命名音轨，各轨独立设置开始时间。
- 🧩 **多种语法**：内置 `aj`（ASCII 简谱）、`ip7`（紧凑语法）、`Tr3`，另有原生 `musicjs` 代码格式；通过格式注册表可扩展。
- ⚙️ **每轨参数**：语法、乐谱源代码、开始时间（秒）、初始 BPM，以及各语法独有的参数（如 Tr3 的分隔符）。
- ▶️ **即时播放**：基于 Web Audio 的前瞻调度器，支持播放 / 暂停 / 跳转，进度以滑块或秒数输入调整，带主音量。
- 🔴 **实时高亮**：播放时代码框切换为不可编辑的富文本，浅红色标记正在发声的音符，并智能自动滚动（尽量让所有高亮音符同屏；装不下时放开自由滚动）。
- 🗂️ **折叠未播放轨**：全局开关，播放时自动折叠「未开始 / 已结束」的音轨（含过渡动画，尊重 `prefers-reduced-motion`）。
- 💾 **会话存取**：导入 / 导出 JSON，浏览器 `localStorage` 自动保存。

## 技术栈

| 分类 | 选用 |
| --- | --- |
| 框架 | Vue 3（`<script setup>` + TypeScript） |
| 构建 | Vite |
| UI | Bootstrap 5 + bootstrap-vue-next（组件按需自动引入） |
| 状态 | Pinia |
| 测试 | Vitest + @vue/test-utils |
| JS 解释器 | Sval（在执行原生 `musicjs` 代码时追踪 `note()` 等函数的调用位置） |
| 包管理 | Yarn 4（Corepack） |

## 环境要求

- **Node.js** `^20.19.0 || >=22.12.0`（Vite 要求；本项目在 Node 24 上开发）
- **Corepack**（随 Node 附带），用于启用 Yarn 4

## 快速开始

```bash
# 启用 Yarn 4（首次）
corepack enable

# 安装依赖
yarn install

# 启动开发服务器（默认 http://localhost:5173）
yarn dev
```

> 浏览器打开终端输出的地址即可。音频需要一次用户手势才能开始（点击「播放」即可）。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `yarn dev` | 启动开发服务器（HMR 热更新），默认端口 `5173`，监听局域网 |
| `yarn build` | 类型检查（`vue-tsc --noEmit`）+ 生产构建，输出到 `dist/` |
| `yarn preview` | 本地预览 `dist/` 产物 |
| `yarn test` | 运行单元测试（Vitest，跑一次） |
| `yarn test:watch` | 单元测试监听模式 |

## 调试

- **开发服务器**：`yarn dev` 后修改 `src/` 下的文件会自动热更新。若改动了 `vite.config.ts` / `vitest.config.ts` / `tsconfig.json`，需要**重启**开发服务器。
- **类型检查**：`yarn vue-tsc --noEmit`（也包含在 `yarn build` 中）。
- **组件自动引入**：本项目用 `unplugin-vue-components` + `BootstrapVueNextResolver` 按需引入 bootstrap-vue-next 的组件与指令（bootstrap-vue-next v1.x 不再由插件全局注册组件）。它会在 `src/components.d.ts` 生成全局组件声明；改动解析器配置后需重启。
- **浏览器调试**：使用浏览器 DevTools 与 [Vue DevTools](https://devtools.vuejs.org/) 扩展；Pinia 状态可在 Vue DevTools 中查看。
- **音频问题**：确认已与页面交互（用户手势）后再播放；若无声，检查系统/标签页音量与「音量」滑块。
- **只测单个文件**：`yarn vitest run tests/format-fidelity.spec.ts`。

## 构建与部署

```bash
yarn build     # 生成 dist/（静态资源，可直接部署到任意静态托管）
yarn preview   # 用本地服务器预览构建产物
```

## 测试

单元测试位于 `tests/`，重点是**保真测试**：把 `tests/reference/` 里的原始 `aj` / `ip7` / `Tr3` 函数加载到受控运行时，与移植版逐音符对比 `start` / `end` / `frequency` / `gain`，确保重写与参考实现行为一致（含 NaN、连音、跳转、休止等边界）。

```bash
yarn test          # 单次
yarn test:watch    # 监听
```

## 目录结构

```
src/
  main.ts                     # 入口：挂载 App、Pinia、bootstrap-vue-next 插件与样式
  App.vue                     # 根组件（<BApp>）
  styles/main.css             # 全局样式（高亮色、reduce-motion 等）
  types/session.ts            # Session / Track 数据模型与工厂
  formats/                    # 乐谱语法（插件）
    types.ts                  # FormatDef / NoteEvent 等类型
    runtime.ts                # musicjs 收集式运行时（含位置钩子）
    aj.ts  ip7.ts  tr3.ts     # 三种语法的移植解析器（带源码位置）
    musicjs.ts                # 原生 musicjs 代码格式：由 Sval 解释器沙箱执行，
                              # 并在 note()/noteJust()/noteHz() 调用处记录源码位置
    registry.ts               # 语法注册表（新增语法只需在此登记）
  audio/engine.ts             # Web Audio 实时引擎（前瞻调度 / 播放 / 暂停 / 跳转）
  stores/                     # Pinia：session / playback / settings
  composables/                # useTrackEvents / usePrefersReducedMotion
  utils/                      # highlight（分词高亮）/ time（时间格式化）
  components/                 # TopBar / TrackList / TrackCard / TrackCodeView /
                              # TransportBar / TrackSettingsPanel / GlobalSettings
tests/
  format-fidelity.spec.ts     # 对照原始实现的保真测试
  reference/                  # 原始 aj / ip7 / Tr3 实现（保真测试用）
```

## 多轨会话（JSON）

「导出」会把整个会话序列化为 JSON；「导入」可读回。结构约为：

```jsonc
{
  "version": 1,
  "name": "未命名乐曲",
  "tracks": [
    {
      "id": "…",
      "name": "主旋律",
      "format": "aj",              // 'aj' | 'ip7' | 'tr3' | 'musicjs' | …
      "code": "1 1 5 5 6 6 5",
      "startTime": 0,              // 相对乐曲起点的开始时间（秒）
      "bpm": 120,                  // 初始 BPM
      "params": {},                // 语法专属参数（如 tr3 的 separator）
      "muted": false
    }
  ]
}
```

## 参考代码

`tests/reference/` 保存了原始 `aj` / `ip7` / `Tr3` 实现，供单元的**保真测试**直接加载并与移植版逐音符对比，因此请勿删除或改动。

## 许可

仅供学习与个人使用；各乐谱语法的原始作者与出处见各文件头部注释。
