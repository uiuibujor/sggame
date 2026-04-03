import { buildDraftPrompt } from "../../shared/draftPrompt.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const config = {
  path: "/api/draft/choice",
};

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Battle-Proxy": "netlify-edge",
      ...CORS_HEADERS,
    },
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

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (request.method !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  const apiKey = Netlify.env.get("SILICONFLOW_API_KEY");
  const model = Netlify.env.get("SILICONFLOW_MODEL") || "deepseek-ai/DeepSeek-V3.2";
  const upstreamUrl = "https://api.siliconflow.cn/v1/chat/completions";

  if (!apiKey) {
    return json(500, {
      error: "Missing SILICONFLOW_API_KEY in Netlify environment variables.",
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Request body must be valid JSON." });
  }

  const { draft } = body || {};
  if (!draft) {
    return json(400, { error: "Request body is missing draft data." });
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
    return json(upstreamResponse.status || 500, {
      error: "Upstream AI draft request failed.",
      detail,
    });
  }

  const payload = await upstreamResponse.json();
  const rawText = payload?.choices?.[0]?.message?.content || "";

  if (!rawText) {
    return json(502, {
      error: "AI did not return a draft choice.",
    });
  }

  try {
    const decision = normalizeDraftDecision(extractJsonObject(rawText), rawText);
    return json(200, { decision });
  } catch (error) {
    return json(502, {
      error: error instanceof Error ? error.message : "Failed to parse AI draft choice.",
      rawText,
    });
  }
}
