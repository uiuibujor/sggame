import { getHeroById } from "./gameLogic";

function mapLineup(lineup) {
  return Object.fromEntries(
    Object.entries(lineup).map(([positionId, heroId]) => {
      const hero = heroId ? getHeroById(heroId) : null;
      return [
        positionId,
        hero
          ? {
              id: hero.id,
              name: hero.name,
              title: hero.title,
              color: hero.color,
            }
          : null,
      ];
    }),
  );
}

function buildGamePayload(game) {
  return {
    lineupA: mapLineup(game.lineupA),
    lineupB: mapLineup(game.lineupB),
    positions: {
      lord: "主公：全队中枢，只允许蓝色主公人选承担这一位。",
      strategist: "军师：负责谋划、调度与拆解局势，决定整队的节奏感。",
      commander: "元帅：统筹正面战场，决定推进、换线与接战方式。",
      vanguard: "先锋：最先接战，决定开局碰撞强度与破口方向。",
      cavalry: "骑兵：负责高速突击、追击与侧翼撕扯。",
      navy: "水军：负责水路与侧线压力，常常带来变数与机动空间。",
      logistics: "后勤：负责补给、续航、调度与阵线恢复能力。",
      spy: "间谍：负责情报、潜伏、渗透与暗线牵制。",
    },
  };
}

export async function streamLineupCommentary(game, handlers = {}, options = {}) {
  const response = await fetch("/api/lineup/commentary", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      game: buildGamePayload(game),
    }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    const detail = await response.text();
    throw new Error(detail || "AI lineup commentary request failed");
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await response.json();
    const text = typeof payload?.text === "string" ? payload.text.trim() : "";

    if (!text) {
      throw new Error(payload?.error || "AI did not return a lineup commentary");
    }

    handlers.onComplete?.(text);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";
  let didReceiveComplete = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const eventBlock of events) {
      const lines = eventBlock.split("\n");
      const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
      const dataLine = lines.find((line) => line.startsWith("data:"))?.slice(5).trim();

      if (!eventName || !dataLine) {
        continue;
      }

      const payload = JSON.parse(dataLine);

      if (eventName === "chunk") {
        const text = payload.text || "";
        fullText += text;
        handlers.onChunk?.(text, fullText);
      } else if (eventName === "complete") {
        didReceiveComplete = true;
        const text = payload.text || fullText;
        handlers.onComplete?.(text);
        return text;
      } else if (eventName === "error") {
        throw new Error(payload.error || "AI lineup commentary stream failed");
      }
    }
  }

  if (fullText && !didReceiveComplete) {
    throw new Error("AI lineup commentary stream ended before completion");
  }

  return fullText;
}
