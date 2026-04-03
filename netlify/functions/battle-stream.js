import { buildPrompt, getProxyConfig } from "../../server/proxyCore.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

export const config = {
  path: "/api/battle/stream",
};

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
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

  const { model, apiKey, upstreamUrl } = getProxyConfig();

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

  const prompt = buildPrompt(game);
  const upstreamResponse = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      // Netlify streamed synchronous functions are easier to truncate on long
      // AI outputs, so production uses a buffered upstream response instead.
      stream: false,
      temperature: 1.1,
      max_tokens: 12000,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    }),
  });

  if (!upstreamResponse.ok) {
    const detail = await upstreamResponse.text();
    return json(upstreamResponse.status || 500, {
      error: "Upstream AI request failed.",
      detail,
    });
  }

  let payload;
  try {
    payload = await upstreamResponse.json();
  } catch {
    return json(502, {
      error: "Failed to parse upstream AI response.",
    });
  }

  const choice = payload?.choices?.[0];
  const message = choice?.message;
  const text = (message?.content || message?.reasoning_content || "").trim();

  if (!text) {
    return json(502, {
      error: "AI response did not include a battle report.",
    });
  }

  return json(200, {
    text,
    mode: "buffered",
  });
}
