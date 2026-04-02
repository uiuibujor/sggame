import { createServer } from "node:http";
import { getProxyConfig, handleProxyRequest } from "./proxyCore.js";

const { port } = getProxyConfig();

const server = createServer(async (req, res) => {
  const handled = await handleProxyRequest(req, res);
  if (!handled) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Not Found" }));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`AI proxy listening on http://127.0.0.1:${port}`);
});
