import { defineConfig } from "vitepress";

export default defineConfig({
  lang: "zh-CN",
  title: "三国对抗赛",
  description: "React + Vite 重构版本说明文档",
  themeConfig: {
    nav: [
      { text: "首页", link: "/" },
      { text: "玩法说明", link: "/gameplay" },
    ],
    sidebar: [
      {
        text: "项目文档",
        items: [
          { text: "重构概览", link: "/" },
          { text: "玩法说明", link: "/gameplay" },
        ],
      },
    ],
  },
});
