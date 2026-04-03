import { POSITIONS } from "../data/gameData";
import { getHeroById, getPlayerName, getTurnConfig } from "./gameLogic";

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

export async function chooseDraftDecision(game) {
  const response = await fetch("/api/draft/choice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      draft: buildDraftPayload(game),
    }),
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
}
