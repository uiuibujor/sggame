import { existsSync, readFileSync } from "node:fs";
import { buildDraftPrompt } from "../shared/draftPrompt.js";

export function loadEnvFromFile() {
  if (!existsSync(".env")) {
    return;
  }

  const envText = readFileSync(".env", "utf-8");
  envText.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 0) {
      return;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
}

loadEnvFromFile();

function readEnv(key) {
  if (process.env[key]) {
    return process.env[key];
  }

  if (typeof Netlify !== "undefined" && Netlify.env?.get) {
    return Netlify.env.get(key);
  }

  return undefined;
}

export function getProxyConfig() {
  return {
    port: Number(readEnv("AI_PROXY_PORT") || 8787),
    model: readEnv("SILICONFLOW_MODEL") || "deepseek-ai/DeepSeek-V3.2",
    apiKey: readEnv("SILICONFLOW_API_KEY"),
    upstreamUrl: "https://api.siliconflow.cn/v1/chat/completions",
  };
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.end(JSON.stringify(payload));
}

function sse(res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
}

function sendEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function extractJsonObject(text) {
  if (!text || typeof text !== "string") {
    throw new Error("AI response was empty");
  }

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fencedMatch?.[1] || text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");

  if (start < 0 || end < start) {
    throw new Error("AI response did not contain a JSON object");
  }

  return JSON.parse(source.slice(start, end + 1));
}

function normalizeDraftDecision(rawDecision, rawText) {
  const action = rawDecision?.action === "end_turn" ? "end_turn" : "pick";
  const heroId = typeof rawDecision?.heroId === "string" ? rawDecision.heroId : typeof rawDecision?.hero_id === "string" ? rawDecision.hero_id : null;
  const positionId =
    typeof rawDecision?.positionId === "string"
      ? rawDecision.positionId
      : typeof rawDecision?.position_id === "string"
        ? rawDecision.position_id
        : null;
  const feedback =
    typeof rawDecision?.feedback === "string"
      ? rawDecision.feedback.trim()
      : typeof rawDecision?.reason === "string"
        ? rawDecision.reason.trim()
        : typeof rawDecision?.comment === "string"
          ? rawDecision.comment.trim()
          : "";

  return {
    action,
    heroId: action === "pick" ? heroId : null,
    positionId: action === "pick" ? positionId : null,
    feedback: feedback || rawText.trim(),
  };
}

const EXACT_SYSTEM_PROMPT = `你是一个 “架空三国战争推演系统” ，核心使命是导演一场逻辑自洽、过程跌宕、充满人性变数、极具直播解说感的史诗对决。

核心理念：战争过程 > 阵容强弱；人物决策与人性 > 静态对比；戏剧性与意外性 > 机械胜负。

【一、世界观规则】
战争目标：夺取当前战场的绝对控制权（如占领城池、击杀主帅、彻底击溃敌军等），而非单纯消灭对方。

完全架空，所有人物视为敌对阵营（不参考历史阵营关系）。

同阵容中存在历史亲密关系（如刘关张）→ 可增强配合，但不允许叛变。但：若同阵容中存在历史敌对或猜忌关系（如曹操与刘备、司马懿与曹爽等），可触发分裂或消极行为。

人物性格与战术风格标签（核心驱动力）：每个角色隐含其大众认知的性格标签（如：关羽的“傲”、张飞的“莽”、诸葛的“慎”、曹操的“疑”、吕布的“反复”、魏延的“怨”等），其行为、失误、甚至叛变都需与此标签挂钩。

获胜条件：一方完全控制战场（如占领城池、击杀主帅、彻底击溃敌军等），或对方主帅叛变/逃跑/被生擒。

禁止平局：必须有明确胜负，不能以“双方都很强”或“战况胶着”为由判定平局。
【二、核心原则】
❗严禁：直接根据阵容强弱判断胜负、开局碾压、“因为更强所以赢”。
胜负必须源于：战术选择、人物行为（含符合/违背性格的决策）、战场变化、关键转折事件、人物命运分支（叛变/逃跑/倒戈等）。

【三、战斗结构（8阶段，必须严格执行）】
整场战斗必须按顺序分为以下8个阶段，严禁跳阶段、合并阶段、增减阶段。

阶段1：列阵与士气
叙事焦点：双方阵容亮相，主将/军师发表战前宣言或战术布置。

必须包含：

双方初步战术意图（如：强攻左翼、诱敌深入、斩首行动等）

士气状态描述（高昂/平稳/低落，及原因）

可埋下伏笔（如某人眼神闪烁，暗示后续叛变）

阶段2：先锋交锋
叙事焦点：先锋大将单挑或先锋部队正面碰撞。

必须包含：

至少一次先锋级人物的直接交手

初期试探的结果（谁占小优/谁在隐藏实力）

阶段3：三线全面开战
叙事焦点：骑兵/水军/弓弩/奇兵等多战线同时展开。

必须包含：

至少3条不同战线的独立战斗描述

每条战线有明确的交手与变化（僵持→一方占优→另一方反击）

初步出现局部优势方和局部危机方

阶段4：战场僵持与暗流
叙事焦点：正面战场陷入胶着，谁也无法快速击溃对方。

必须包含以下之一或更多：

间谍活动：情报战、策反、假消息

伏兵准备：一方暗中调动预备队

人物心态变化：某角色开始动摇（恐惧/贪婪/愤怒/怀疑主帅）

可触发叛变/逃跑的“前兆”（如某人被孤立、被侮辱、或被敌方密使接触）

阶段5：关键转折（必须有，且是分水岭）
叙事焦点：一个决定战局走向的事件发生，彻底打破僵持。

转折类型（不仅限于战术，必须包含人物分支可能性）：

战术类：奇袭成功、伏兵现身、粮道被断、主阵被冲

人物分支类（重点新增）：

叛变/倒戈：某角色当场反水，率部攻击原友军（触发条件：被策反/对主帅不满/性格中的反复/被许诺重利）

临阵逃跑：某角色畏惧战局，带亲信脱离战场（触发条件：士气崩溃/性格中的怯懦/被主帅牺牲）

消极避战：某角色按兵不动，坐视友军被灭（触发条件：私怨/保存实力/等待投机的机会）

诈降反杀：假装投降，关键时刻背刺敌方

主帅冒险决策：孤注一掷的冲锋或计策，成功或失败直接改变局势

必须满足：

有明确触发原因（不能凭空叛变）

有具体人物参与

改变战局方向（从A优势变为B优势，或从僵持变为一方崩溃）

阶段6：战局混乱与追击/溃逃
叙事焦点：转折事件引发的连锁反应，战场进入无序状态。

必须包含：

优势方如何扩大战果（追击、包围、分割）

劣势方如何应对（组织反击、断后掩护、四散溃逃、部分角色逃跑）

至少一个逃跑/撤退的具体描写（谁逃了、怎么逃的、是否成功）

战场情绪变化（恐慌/狂喜/绝望/愤怒）

阶段7：总决战（主帅与核心人物对决）
叙事焦点：主公/军师/元帅/顶级武将亲自卷入核心战场，战局进入最终白热化。

必须包含：

至少一位主帅级人物亲自参与战斗或指挥核心反击

体现配合（如军师+猛将）与冲突（如两人争功导致失误）

决出最终胜负的最后一击或最后一计（可以是一刀、一箭、一场火、一次崩溃）

阶段8：战后结局与余波
叙事焦点：尘埃落定，胜负已分，所有人的命运揭晓。

必须包含：

胜负判决：明确胜方与败方

核心胜因：一句话总结为什么赢

每个有名有姓的角色必须有结局（从以下中选择）：

阵亡（战死/被斩/死于乱军）

重伤（后续可能死或退隐）

被生擒（投降/被处决/被交换）

逃跑（成功逃脱/途中被杀/投奔第三方）

叛变（加入胜方/自立/下落不明）

幸存撤退（带残部离开）

失踪（生死不明，留悬念）

余波描述（可选）：对后续局势的影响、胜方的代价、败方的残余力量

【四、人物命运分支系统（新增核心规则）】
⚠️ 以下行为是允许的，但必须有触发条件，不能凭空发生：

行为	定义	常见触发条件
叛变/倒戈	战斗中突然攻击原友军	被敌方策反/对主帅严重不满/性格中的反复无常（如吕布）/被许诺更高利益
临阵逃跑	带亲信脱离战场	士气崩溃/性格中的怯懦/被主帅当作弃子/见大势已去
消极避战	按兵不动，坐视友军被灭	与主帅有私怨/保存实力/等待投机/被策反但未公开
诈降	假装投降，关键时刻背刺	将计就计的计策/性格中的狡诈
牺牲断后	主动留下掩护主力撤退	忠义性格/欠人情/绝望中的悲壮选择
擒贼先擒王	直冲主帅	勇猛/冒险性格/孤注一掷
⚠️ 禁止：全员忠诚到底（太假）、全员叛变（太乱）、毫无理由的背叛（逻辑崩坏）。

【五、战斗风格控制】
每局必须呈现以下三种之一，由局势自然形成：

拉锯战（推荐默认）：双方交替占优，战局多次反转。

逆转局：一方前期大优，因一个转折被翻盘（可以是叛变、失误、奇袭）。

碾压局（少量）：过程自然形成，仍需展现被碾压方的绝望抵抗和可能的逃跑/投降。

严禁：开局即碾压、无过程胜利。

【六、人物行为综合规则】
每个角色至少参与一次战斗或关键事件

行为必须符合性格标签（关羽因傲中计，张飞因莽突破，司马懿因疑错失良机，吕布因反复叛变）

必须体现：

高光配合（联动技）

冲突（战术分歧、争功、猜忌）

个体封神时刻（一人改变战局）

人性时刻（恐惧、愤怒、犹豫、背叛、牺牲）

严禁：角色酱油、无作用、全员平均发挥、全员圣人。

【七、胜负生成逻辑】
胜负 = 关键转折的受益者 + 总决战表现 + 人物命运分支的影响。

如果不确定，优先判给“在关键转折中抓住机会并付出最大代价”的一方。

【八、叙事风格：直播解说感】
节奏：短句为主，快慢交替。危急时用连续短促句，决胜时用爆发式长句。

画面：多用动作和状态词（撕裂、碾压、倾泻、崩解、穿透、包抄、截断、吞噬）。

解说感：像在直播一场电竞赛事，有解说员的“预测、惊呼、总结、质疑”。

每阶段结尾可加一句 “解说金句” 升华。

解说金句示例：

“他拔刀的方向，不是敌人——而是刚才还叫兄弟的人！”

“所有人都以为他跑了，但他在等一个时机。”

“这不是溃败，这是有组织的——呃，不，这就是溃败。”

“左边是火海，右边是追兵，中间，是绝望。而绝望，会让人做出意想不到的事。”

【九、最终约束（检查清单）】
8个阶段完整且顺序正确

胜负已分，非平局

有关键转折事件，且改变了局势

有至少一个人物命运分支行为（叛变/逃跑/倒戈/消极/诈降/牺牲断后）

每个有名有姓的角色都有明确结局

战斗过程前后一致，逻辑自洽

胜负源于过程，非单纯阵容强弱

具有直播解说感`;

export function buildPrompt(gamePayload) {
  const user = [
    "请严格按照系统提示词执行，不要改写世界观、规则、阶段顺序和判断标准。",
    "胜负判断完全交给你根据过程推演决定，不要套用静态面板强弱。",
    "最终输出只需要 markdown 战报正文，不要输出 JSON，不要输出额外的结构化结果，不要自动统计或记录胜负分数。",
    "必须明确输出且只选择一种结论：`蓝方获胜` 或 `红方获胜`。请在战报结尾单独成行写出这句话，便于前端识别最终结果。",
    "请在 markdown 正文中自然写出最终胜者、核心胜因和所有关键人物结局，但不要用 JSON、表格或程序化字段。",
    "",
    "对局信息如下：",
    `玩家A阵容：${JSON.stringify(gamePayload.lineupA, null, 2)}`,
    `玩家B阵容：${JSON.stringify(gamePayload.lineupB, null, 2)}`,
    `位置说明：${JSON.stringify(gamePayload.positions, null, 2)}`,
  ].join("\n");

  return { system: EXACT_SYSTEM_PROMPT, user };
}

async function handleBattleStream(req, res) {
  const { model, apiKey, upstreamUrl } = getProxyConfig();

  if (!apiKey) {
    json(res, 500, {
      error: "缺少 SILICONFLOW_API_KEY，请先在 .env 中配置。",
    });
    return;
  }

  const body = await readJsonBody(req);
  const { game } = body;
  if (!game) {
    json(res, 400, { error: "请求体缺少 game 数据。" });
    return;
  }

  const prompt = buildPrompt(game);
  const upstreamResponse = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: true,
      temperature: 1.1,
      max_tokens: 12000,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    }),
  });

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    const detail = await upstreamResponse.text();
    json(res, upstreamResponse.status || 500, {
      error: "硅基流动接口请求失败。",
      detail,
    });
    return;
  }

  sse(res);

  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";

  try {
    for await (const chunk of upstreamResponse.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }

        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") {
          continue;
        }

        const payload = JSON.parse(data);
        const choice = payload.choices?.[0];
        const deltaText = choice?.delta?.content || choice?.delta?.reasoning_content || "";

        if (!deltaText) {
          continue;
        }

        fullText += deltaText;
        sendEvent(res, "chunk", { text: deltaText });
      }
    }

    sendEvent(res, "complete", {
      text: fullText.trim(),
    });
    sendEvent(res, "done", { ok: true });
    res.end();
  } catch (error) {
    sendEvent(res, "error", {
      error: error instanceof Error ? error.message : "流式解析失败",
    });
    res.end();
  }
}

async function handleDraftChoice(req, res) {
  const { model, apiKey, upstreamUrl } = getProxyConfig();

  if (!apiKey) {
    json(res, 500, {
      error: "Missing SILICONFLOW_API_KEY. Please configure it in .env first.",
    });
    return;
  }

  const body = await readJsonBody(req);
  const { draft } = body;
  if (!draft) {
    json(res, 400, { error: "Request body is missing draft data." });
    return;
  }

  const prompt = buildDraftPrompt(draft);
  const upstreamResponse = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0.7,
      max_tokens: 900,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    }),
  });

  if (!upstreamResponse.ok) {
    const detail = await upstreamResponse.text();
    json(res, upstreamResponse.status || 500, {
      error: "SiliconFlow draft choice request failed.",
      detail,
    });
    return;
  }

  const payload = await upstreamResponse.json();
  const rawText = payload?.choices?.[0]?.message?.content || "";

  if (!rawText) {
    json(res, 502, {
      error: "AI did not return a draft choice.",
    });
    return;
  }

  try {
    const decision = normalizeDraftDecision(extractJsonObject(rawText), rawText);
    json(res, 200, { decision });
  } catch (error) {
    json(res, 502, {
      error: error instanceof Error ? error.message : "Failed to parse AI draft choice.",
      rawText,
    });
  }
}

export async function handleProxyRequest(req, res) {
  const { model, apiKey } = getProxyConfig();

  if (!req.url) {
    json(res, 404, { error: "Not Found" });
    return true;
  }

  if (req.method === "OPTIONS" && req.url.startsWith("/api/")) {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
    res.end();
    return true;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    json(res, 200, { ok: true, model, hasApiKey: Boolean(apiKey) });
    return true;
  }

  if (req.method === "POST" && req.url === "/api/battle/stream") {
    try {
      await handleBattleStream(req, res);
    } catch (error) {
      json(res, 500, {
        error: error instanceof Error ? error.message : "服务内部错误",
      });
    }
    return true;
  }

  if (req.method === "POST" && req.url === "/api/draft/choice") {
    try {
      await handleDraftChoice(req, res);
    } catch (error) {
      json(res, 500, {
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
    return true;
  }

  return false;
}
