import { POSITIONS } from "../data/gameData";
import { getHeroById, getPlayerName, getTurnConfig } from "./gameLogic";

const AI_DRAFT_DECISION_TIMEOUT_MS = 15000;

function mapHero(hero) {
  if (!hero) {
    return null;
  }

  return {
    id: hero.id,
    name: hero.name,
    title: hero.title,
    color: hero.color,
  };
}

function mapLineup(lineup) {
  return Object.fromEntries(
    Object.entries(lineup).map(([positionId, heroId]) => [positionId, mapHero(heroId ? getHeroById(heroId) : null)]),
  );
}

function buildDraftPayload(game) {
  const config = getTurnConfig(game);
  const currentPlayer = game.currentPlayer;
  const opponentPlayer = currentPlayer === "A" ? "B" : "A";
  const currentLineup = currentPlayer === "A" ? game.lineupA : game.lineupB;
  const opponentLineup = currentPlayer === "A" ? game.lineupB : game.lineupA;

  return {
    currentPlayer,
    currentPlayerName: getPlayerName(game, currentPlayer),
    opponentPlayer,
    opponentPlayerName: getPlayerName(game, opponentPlayer),
    turnNumber: (config?.turnNumber ?? game.turnNumber) + 1,
    picksThisTurn: game.picksThisTurn,
    minPicksThisTurn: config?.min ?? 1,
    maxPicksThisTurn: game.maxPicksThisTurn,
    canEndTurn: game.picksThisTurn >= (config?.min ?? 1),
    currentLineup: mapLineup(currentLineup),
    opponentLineup: mapLineup(opponentLineup),
    stillEmptyPositions: POSITIONS.filter((position) => !currentLineup[position.id]).map((position) => ({
      id: position.id,
      name: position.name,
      lordOnlyBlue: position.id === "lord",
    })),
    candidates: game.displayHeroes.map((hero) => mapHero(hero)),
  };
}

export async function chooseDraftDecision(game, options = {}) {
  const timeoutMs = options.timeoutMs ?? AI_DRAFT_DECISION_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch("/api/draft/choice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        draft: buildDraftPayload(game),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || "AI draft choice request failed");
    }

    const payload = await response.json();
    if (!payload?.decision) {
      throw new Error(payload?.error || "AI did not return a valid draft decision");
    }

    return payload.decision;
  } catch (error) {
    if (typeof error === "object" && error && "name" in error && error.name === "AbortError") {
      throw new Error(`AI draft choice timed out after ${Math.ceil(timeoutMs / 1000)} seconds`);
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
