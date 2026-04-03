import { buildLineupCommentaryPrompt } from "../../shared/lineupCommentaryPrompt.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const config = {
  path: "/api/lineup/commentary",
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

  const { game } = body || {};
  if (!game) {
    return json(400, { error: "Request body is missing game data." });
  }

  const prompt = buildLineupCommentaryPrompt(game);
  const upstreamResponse = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0.85,
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
      error: "Upstream AI lineup commentary request failed.",
      detail,
    });
  }

  const payload = await upstreamResponse.json();
  const text = payload?.choices?.[0]?.message?.content?.trim() || "";

  if (!text) {
    return json(502, {
      error: "AI did not return a lineup commentary.",
    });
  }

  return json(200, { text });
}
