import { HEROES, PLAYER_META, POSITIONS } from "../data/gameData";

export function createEmptyLineup() {
  return Object.fromEntries(POSITIONS.map((position) => [position.id, null]));
}

export function createInitialGameState() {
  return {
    phase: "home",
    mode: "pvp",
    currentPlayer: "A",
    turnNumber: 0,
    picksThisTurn: 0,
    maxPicksThisTurn: 2,
    aiTurnTarget: null,
    aiPlayers: {
      A: false,
      B: false,
    },
    lineupA: createEmptyLineup(),
    lineupB: createEmptyLineup(),
    usedHeroes: {},
    displayHeroes: [],
    isRolling: false,
    selectedDisplayIdx: null,
    heldHero: null,
    result: null,
    playerNames: {
      A: PLAYER_META.A.name,
      B: PLAYER_META.B.name,
    },
  };
}

export function getHeroById(heroId) {
  return HEROES.find((hero) => hero.id === heroId) ?? null;
}

export function getLineup(game, player) {
  return player === "A" ? game.lineupA : game.lineupB;
}

export function countLineup(game, player) {
  const lineup = getLineup(game, player);
  return POSITIONS.reduce((count, position) => count + (lineup[position.id] ? 1 : 0), 0);
}

export function isUsed(game, heroId) {
  return Boolean(game.usedHeroes[heroId]);
}

export function getAvailableHeroes(game) {
  return HEROES.filter((hero) => !isUsed(game, hero.id));
}

export function heroColor(color) {
  switch (color) {
    case "blue":
      return "var(--blue)";
    case "red":
      return "var(--red)";
    case "green":
      return "var(--green)";
    default:
      return "var(--yellow)";
  }
}

export function getColorClass(color) {
  return `color-${color}`;
}

export function canSubmit(game) {
  if (countLineup(game, "A") < 8 || countLineup(game, "B") < 8) {
    return false;
  }

  const lordA = game.lineupA.lord ? getHeroById(game.lineupA.lord) : null;
  const lordB = game.lineupB.lord ? getHeroById(game.lineupB.lord) : null;
  return lordA?.color === "blue" && lordB?.color === "blue";
}

function getTurnPlayer(turnNumber) {
  if (turnNumber === 0) {
    return "A";
  }

  const cycleIndex = (turnNumber - 1) % 4;
  return cycleIndex < 2 ? "B" : "A";
}

function getTurnLimits(turnNumber, remaining) {
  if (turnNumber === 0) {
    return {
      min: Math.min(1, remaining),
      max: Math.min(2, remaining),
    };
  }

  return {
    min: 1,
    max: Math.min(2, remaining),
  };
}

export function getTurnConfig(game) {
  const countA = countLineup(game, "A");
  const countB = countLineup(game, "B");

  if (countA >= 8 && countB >= 8) {
    return null;
  }

  let turnNumber = game.turnNumber;

  while (true) {
    const player = getTurnPlayer(turnNumber);
    const count = player === "A" ? countA : countB;

    if (count >= 8) {
      turnNumber += 1;
      continue;
    }

    const remaining = 8 - count;
    const limits = getTurnLimits(turnNumber, remaining);

    return {
      player,
      min: limits.min,
      max: limits.max,
      turnNumber,
    };
  }
}

export function getStateAfterAdvanceTurn(game) {
  const baseState = {
    ...game,
    picksThisTurn: 0,
    aiTurnTarget: null,
    heldHero: null,
    selectedDisplayIdx: null,
    displayHeroes: [],
    isRolling: false,
  };

  const nextTurnNumber = game.turnNumber + 1;
  const config = getTurnConfig({ ...baseState, turnNumber: nextTurnNumber });

  if (!config) {
    return {
      ...baseState,
      phase: "arrange",
      turnNumber: nextTurnNumber,
    };
  }

  return {
    ...baseState,
    phase: "draft",
    currentPlayer: config.player,
    maxPicksThisTurn: config.max,
    turnNumber: config.turnNumber,
  };
}

export function takeRandomHeroes(pool, count) {
  const shuffled = [...pool];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function buildDraftCandidates(game) {
  const availableHeroes = getAvailableHeroes(game);
  const blueHeroes = takeRandomHeroes(
    availableHeroes.filter((hero) => hero.color === "blue"),
    1,
  );
  const otherHeroes = takeRandomHeroes(
    availableHeroes.filter((hero) => hero.color !== "blue"),
    5,
  );

  if (blueHeroes.length === 0) {
    return takeRandomHeroes(availableHeroes, 6);
  }

  if (otherHeroes.length === 5) {
    return [...blueHeroes, ...otherHeroes];
  }

  const usedIds = new Set([...blueHeroes, ...otherHeroes].map((hero) => hero.id));
  const fallbackHeroes = takeRandomHeroes(
    availableHeroes.filter((hero) => !usedIds.has(hero.id)),
    5 - otherHeroes.length,
  );

  return [...blueHeroes, ...otherHeroes, ...fallbackHeroes];
}

export function getHeldHero(game) {
  return game.heldHero ? getHeroById(game.heldHero) : null;
}

export function getPlayerName(game, player) {
  return game.playerNames?.[player]?.trim() || PLAYER_META[player].name;
}

export function getPlayerLabel(game, player) {
  const meta = PLAYER_META[player];
  return `${getPlayerName(game, player)}（${meta.subtitle}）`;
}

export function getFooterText(game) {
  if (game.phase === "arrange") {
    const hints = [];
    const lordA = game.lineupA.lord ? getHeroById(game.lineupA.lord) : null;
    const lordB = game.lineupB.lord ? getHeroById(game.lineupB.lord) : null;

    if (lordA?.color !== "blue") {
      hints.push(`${getPlayerName(game, "A")}的主公位必须是蓝色英雄`);
    }
    if (lordB?.color !== "blue") {
      hints.push(`${getPlayerName(game, "B")}的主公位必须是蓝色英雄`);
    }

    return hints.length > 0 ? hints.join(" | ") : "阵容已合法，可以提交给 AI 推演。";
  }

  if (game.phase === "draft") {
    const config = getTurnConfig(game);
    if (config) {
      return `${getPlayerName(game, config.player)}的回合，第 ${config.turnNumber + 1} 步，本回合可选 ${config.min}-${config.max} 人。`;
    }
  }

  return "";
}

export function getPositionRoleHint(positionId) {
  switch (positionId) {
    case "lord":
      return "主阵核心，只允许蓝色主公人选。";
    case "strategist":
      return "负责出谋划策，容易成为计策发动点。";
    case "commander":
      return "统筹主战场，决定正面推进节奏。";
    case "vanguard":
      return "最先接战，常是局势升温的起点。";
    case "cavalry":
      return "强调机动突击，适合侧翼冲击与追击。";
    case "navy":
      return "负责水路与侧面战线，常引发变数。";
    case "logistics":
      return "维系补给、调度与续战能力。";
    default:
      return "潜伏与情报位，容易牵出暗线与反转。";
  }
}
