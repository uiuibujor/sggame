import { buildPrompt } from "../../shared/battlePrompt.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const config = {
  path: "/api/battle/stream",
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

function sseEvent(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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
    return json(upstreamResponse.status || 500, {
      error: "Upstream AI request failed.",
      detail,
    });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8");

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstreamResponse.body.getReader();
      let buffer = "";
      let fullText = "";

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
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
            controller.enqueue(encoder.encode(sseEvent("chunk", { text: deltaText })));
          }
        }

        controller.enqueue(encoder.encode(sseEvent("complete", { text: fullText.trim() })));
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            sseEvent("error", {
              error: error instanceof Error ? error.message : "AI stream parsing failed",
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Battle-Proxy": "netlify-edge",
      ...CORS_HEADERS,
    },
  });
}
