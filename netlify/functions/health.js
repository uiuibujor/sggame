import { getProxyConfig } from "../../server/proxyCore.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export const config = {
  path: "/api/health",
};

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...CORS_HEADERS,
      },
    });
  }

  const { model, apiKey } = getProxyConfig();

  return new Response(
    JSON.stringify({
      ok: true,
      model,
      hasApiKey: Boolean(apiKey),
      runtime: "netlify-function",
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Battle-Proxy": "netlify-function",
        ...CORS_HEADERS,
      },
    },
  );
}
