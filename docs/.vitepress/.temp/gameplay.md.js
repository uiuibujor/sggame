import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"玩法说明","description":"","frontmatter":{},"headers":[],"relativePath":"gameplay.md","filePath":"gameplay.md"}');
const _sfc_main = { name: "gameplay.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="玩法说明" tabindex="-1">玩法说明 <a class="header-anchor" href="#玩法说明" aria-label="Permalink to &quot;玩法说明&quot;">​</a></h1><h2 id="基本流程" tabindex="-1">基本流程 <a class="header-anchor" href="#基本流程" aria-label="Permalink to &quot;基本流程&quot;">​</a></h2><ol><li>玩家 A 先手，首回合选择 1 名武将。</li><li>玩家 B 后手，第二回合选择 2 名武将。</li><li>后续双方轮流，每回合可以选择 1 到 2 名武将。</li><li>双方 8 个位置都补满后，进入阵容调整与 AI 裁决阶段。</li></ol><h2 id="位置设计" tabindex="-1">位置设计 <a class="header-anchor" href="#位置设计" aria-label="Permalink to &quot;位置设计&quot;">​</a></h2><table tabindex="0"><thead><tr><th>位置</th><th>核心倾向</th></tr></thead><tbody><tr><td>主公</td><td>只允许蓝色英雄，统率权重最高</td></tr><tr><td>军师</td><td>智力权重最高</td></tr><tr><td>元帅</td><td>武力、智力、统率较均衡</td></tr><tr><td>先锋</td><td>武力权重最高</td></tr><tr><td>骑兵</td><td>武力与机动型角色更强</td></tr><tr><td>水军</td><td>智力与统率都有价值</td></tr><tr><td>后勤</td><td>统率与续航型角色更稳</td></tr><tr><td>间谍</td><td>智力与潜伏能力更占优</td></tr></tbody></table><h2 id="技能卡" tabindex="-1">技能卡 <a class="header-anchor" href="#技能卡" aria-label="Permalink to &quot;技能卡&quot;">​</a></h2><ul><li>消卡：移除双方同一位置的武将</li><li>换卡：交换双方同一位置的武将</li><li>禁人：禁用一个还未上场的武将</li><li>任选四：跳过点将，直接从剩余武将里选择</li><li>重摇：对当前候选武将重新抽取一次</li></ul><h2 id="ai-裁决" tabindex="-1">AI 裁决 <a class="header-anchor" href="#ai-裁决" aria-label="Permalink to &quot;AI 裁决&quot;">​</a></h2><p>AI 会按位置权重计算每名武将的基础战力，再叠加少量随机波动：</p><ul><li>差距很小时判定为平局</li><li>差距明显时判定出该位置胜负</li><li>全部位置结算后统计总分并选出 MVP</li></ul></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("gameplay.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const gameplay = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  gameplay as default
};
