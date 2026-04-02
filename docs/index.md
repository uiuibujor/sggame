# 三国对抗赛

这是 `sg.html` 的 React 重构版本说明页。

## 这次重构做了什么

- 将原本单文件内联的 HTML、CSS、JS 拆成 `React + Vite` 的标准工程结构
- 把英雄数据、位置权重、AI 裁决逻辑抽离成可复用模块
- 保留原来的双人选将、技能卡、布阵与 AI 战报流程
- 用 `VitePress` 补了一套轻量文档站，方便继续补玩法和开发说明

## 目录结构

```txt
src/
  App.jsx
  data/gameData.js
  lib/gameLogic.js
  styles.css
docs/
  .vitepress/config.mts
  index.md
  gameplay.md
```

## 本地启动

```bash
npm install
npm run dev
```

文档站单独运行：

```bash
npm run docs:dev
```

## 关于 VitePress

VitePress 本身是基于 Vue 构建的文档站工具，因此这里把它用于项目文档，而不是直接作为 React 游戏的运行时壳。
