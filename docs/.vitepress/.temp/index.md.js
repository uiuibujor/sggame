import { ssrRenderAttrs, ssrRenderStyle } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"三国对抗赛","description":"","frontmatter":{},"headers":[],"relativePath":"index.md","filePath":"index.md"}');
const _sfc_main = { name: "index.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="三国对抗赛" tabindex="-1">三国对抗赛 <a class="header-anchor" href="#三国对抗赛" aria-label="Permalink to &quot;三国对抗赛&quot;">​</a></h1><p>这是 <code>sg.html</code> 的 React 重构版本说明页。</p><h2 id="这次重构做了什么" tabindex="-1">这次重构做了什么 <a class="header-anchor" href="#这次重构做了什么" aria-label="Permalink to &quot;这次重构做了什么&quot;">​</a></h2><ul><li>将原本单文件内联的 HTML、CSS、JS 拆成 <code>React + Vite</code> 的标准工程结构</li><li>把英雄数据、位置权重、AI 裁决逻辑抽离成可复用模块</li><li>保留原来的双人选将、技能卡、布阵与 AI 战报流程</li><li>用 <code>VitePress</code> 补了一套轻量文档站，方便继续补玩法和开发说明</li></ul><h2 id="目录结构" tabindex="-1">目录结构 <a class="header-anchor" href="#目录结构" aria-label="Permalink to &quot;目录结构&quot;">​</a></h2><div class="language-txt vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">txt</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>src/</span></span>
<span class="line"><span>  App.jsx</span></span>
<span class="line"><span>  data/gameData.js</span></span>
<span class="line"><span>  lib/gameLogic.js</span></span>
<span class="line"><span>  styles.css</span></span>
<span class="line"><span>docs/</span></span>
<span class="line"><span>  .vitepress/config.mts</span></span>
<span class="line"><span>  index.md</span></span>
<span class="line"><span>  gameplay.md</span></span></code></pre></div><h2 id="本地启动" tabindex="-1">本地启动 <a class="header-anchor" href="#本地启动" aria-label="Permalink to &quot;本地启动&quot;">​</a></h2><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#6F42C1", "--shiki-dark": "#B392F0" })}">npm</span><span style="${ssrRenderStyle({ "--shiki-light": "#032F62", "--shiki-dark": "#9ECBFF" })}"> install</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#6F42C1", "--shiki-dark": "#B392F0" })}">npm</span><span style="${ssrRenderStyle({ "--shiki-light": "#032F62", "--shiki-dark": "#9ECBFF" })}"> run</span><span style="${ssrRenderStyle({ "--shiki-light": "#032F62", "--shiki-dark": "#9ECBFF" })}"> dev</span></span></code></pre></div><p>文档站单独运行：</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#6F42C1", "--shiki-dark": "#B392F0" })}">npm</span><span style="${ssrRenderStyle({ "--shiki-light": "#032F62", "--shiki-dark": "#9ECBFF" })}"> run</span><span style="${ssrRenderStyle({ "--shiki-light": "#032F62", "--shiki-dark": "#9ECBFF" })}"> docs:dev</span></span></code></pre></div><h2 id="关于-vitepress" tabindex="-1">关于 VitePress <a class="header-anchor" href="#关于-vitepress" aria-label="Permalink to &quot;关于 VitePress&quot;">​</a></h2><p>VitePress 本身是基于 Vue 构建的文档站工具，因此这里把它用于项目文档，而不是直接作为 React 游戏的运行时壳。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("index.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const index = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  index as default
};
