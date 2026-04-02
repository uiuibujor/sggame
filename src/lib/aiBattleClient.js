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
      lord: "主公：主阵核心，只允许蓝色主公人选。",
      strategist: "军师：负责出谋划策，容易成为计策发动点。",
      commander: "元帅：统筹主战场，决定正面推进节奏。",
      vanguard: "先锋：最先接战，常是局势升温的起点。",
      cavalry: "骑兵：强调机动突击，适合侧翼冲击与追击。",
      navy: "水军：负责水路与侧面战线，常引发变数。",
      logistics: "后勤：维系补给、调度与续战能力。",
      spy: "间谍：潜伏与情报位，容易牵出暗线与反转。",
    },
  };
}

export async function streamBattleInference(game, handlers) {
  const response = await fetch("/api/battle/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      game: buildGamePayload(game),
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text();
    throw new Error(detail || "AI 战局推演请求失败");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";

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
        handlers.onComplete?.(payload.text || fullText);
      } else if (eventName === "error") {
        throw new Error(payload.error || "AI 流式输出失败");
      }
    }
  }

  if (fullText) {
    handlers.onComplete?.(fullText);
  }
}
