import { useEffect, useRef, useState } from "react";
import { cjk } from "@streamdown/cjk";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import LineupPanel from "./components/LineupPanel";
import Modal from "./components/Modal";
import RulesContent from "./components/RulesContent";
import { POSITIONS } from "./data/gameData";
import { streamBattleInference } from "./lib/aiBattleClient";
import { chooseDraftDecision } from "./lib/aiDraftClient";
import { streamLineupCommentary } from "./lib/aiLineupClient";
import {
  buildDraftCandidates,
  canSubmit,
  countLineup,
  createInitialGameState,
  getAvailableHeroes,
  getFooterText,
  getHeldHero,
  getHeroById,
  getPlayerName,
  getPlayerLabel,
  getStateAfterAdvanceTurn,
  getTurnConfig,
  heroColor,
  isUsed,
} from "./lib/gameLogic";

const PARTICLES = Array.from({ length: 18 }, (_, index) => ({
  id: index,
  left: `${Math.random() * 100}%`,
  duration: `${8 + Math.random() * 12}s`,
  delay: `${Math.random() * 10}s`,
  size: `${1 + Math.random() * 1.5}px`,
}));

const BATTLE_BUFFER_MS = 20000;
const TYPEWRITER_CHARS_PER_TICK = 1;
const TYPEWRITER_TICK_MS = 25;
const AI_ROLL_MIN_MS = 1200;
const AI_ROLL_MAX_MS = 3000;
const AI_DRAFT_LOG_STORAGE_KEY = "sggame-ai-draft-log";
const DRAFT_TURN_FLASH_MS = 1000;
const POSITION_NAME_BY_ID = Object.fromEntries(POSITIONS.map((position) => [position.id, position.name]));
const STREAMDOWN_PLUGINS = { cjk };

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickAiCandidate(game, player) {
  const candidates = game.displayHeroes.filter((hero) => !isUsed(game, hero.id));
  if (candidates.length === 0) {
    return null;
  }

  const lineup = player === "A" ? game.lineupA : game.lineupB;
  if (!lineup.lord) {
    const lordHero = candidates.find((hero) => hero.color === "blue");
    if (lordHero) {
      return lordHero;
    }
  }

  return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
}

function pickAiPosition(game, player, hero) {
  const lineup = player === "A" ? game.lineupA : game.lineupB;
  const emptyPositions = Object.entries(lineup)
    .filter(([, heroId]) => !heroId)
    .map(([positionId]) => positionId);

  if (emptyPositions.length === 0) {
    return null;
  }

  if (emptyPositions.includes("lord") && hero.color === "blue") {
    return "lord";
  }

  const validPositions = emptyPositions.filter((positionId) => positionId !== "lord");
  if (validPositions.length === 0) {
    return hero.color === "blue" ? "lord" : null;
  }

  return validPositions[Math.floor(Math.random() * validPositions.length)] ?? null;
}

function getPositionName(positionId) {
  return POSITION_NAME_BY_ID[positionId] || positionId;
}

function isPositionValidForHero(game, player, hero, positionId) {
  if (!hero || !positionId || !POSITION_NAME_BY_ID[positionId]) {
    return false;
  }

  const lineup = player === "A" ? game.lineupA : game.lineupB;
  if (lineup[positionId]) {
    return false;
  }

  if (positionId === "lord" && hero.color !== "blue") {
    return false;
  }

  return true;
}

function normalizeAiDraftDecision(game, decision) {
  const config = getTurnConfig(game);
  const minPicksThisTurn = config?.min ?? 1;
  const canEndTurn = game.picksThisTurn >= minPicksThisTurn;
  const feedback = typeof decision?.feedback === "string" ? decision.feedback.trim() : "";

  if (decision?.action === "end_turn") {
    if (!canEndTurn) {
      throw new Error("AI attempted to end the turn before reaching the minimum pick count");
    }

    return {
      action: "end_turn",
      heroId: null,
      positionId: null,
      feedback: feedback || "这一轮阵容已经够用，先收手保留后续选择空间。",
      source: "deepseek",
    };
  }

  const heroId = typeof decision?.heroId === "string" ? decision.heroId : null;
  const positionId = typeof decision?.positionId === "string" ? decision.positionId : null;
  const hero = heroId ? game.displayHeroes.find((candidate) => candidate.id === heroId) : null;

  if (!hero) {
    throw new Error("AI selected a hero that is not in the paused candidate list");
  }

  if (!isPositionValidForHero(game, game.currentPlayer, hero, positionId)) {
    throw new Error("AI selected an invalid position for the chosen hero");
  }

  return {
    action: "pick",
    heroId,
    positionId,
    feedback: feedback || `先拿 ${hero.name}，补到${getPositionName(positionId)}位。`,
    source: "deepseek",
  };
}

function buildFallbackAiDecision(game, reason) {
  const config = getTurnConfig(game);
  const minPicksThisTurn = config?.min ?? 1;

  if (game.picksThisTurn >= minPicksThisTurn && game.displayHeroes.length === 0) {
    return {
      action: "end_turn",
      heroId: null,
      positionId: null,
      feedback: `DeepSeek 暂时没有给出可用决策，${reason}。这一手先结束回合。`,
      source: "fallback",
    };
  }

  const hero = pickAiCandidate(game, game.currentPlayer);
  if (!hero) {
    if (game.picksThisTurn >= minPicksThisTurn) {
      return {
        action: "end_turn",
        heroId: null,
        positionId: null,
        feedback: `DeepSeek 暂时没有给出可用决策，${reason}。当前候选不足，先结束回合。`,
        source: "fallback",
      };
    }

    throw new Error("No fallback AI hero candidates are available");
  }

  const positionId = pickAiPosition(game, game.currentPlayer, hero);
  if (!positionId) {
    if (game.picksThisTurn >= minPicksThisTurn) {
      return {
        action: "end_turn",
        heroId: null,
        positionId: null,
        feedback: `DeepSeek 暂时没有给出可用决策，${reason}。当前没有合适空位，先结束回合。`,
        source: "fallback",
      };
    }

    throw new Error("No fallback AI positions are available");
  }

  return {
    action: "pick",
    heroId: hero.id,
    positionId,
    feedback: `DeepSeek 暂时没有给出可用决策，${reason}。先用兜底策略拿下 ${hero.name}，补到${getPositionName(positionId)}位。`,
    source: "fallback",
  };
}

function detectBattleWinner(markdown) {
  if (!markdown) {
    return null;
  }

  if (
    markdown.includes("蓝方获胜") ||
    markdown.includes("蓝色方获胜") ||
    markdown.includes("玩家A获胜") ||
    markdown.includes("玩家 A 获胜")
  ) {
    return "A";
  }

  if (
    markdown.includes("红方获胜") ||
    markdown.includes("红色方获胜") ||
    markdown.includes("玩家B获胜") ||
    markdown.includes("玩家 B 获胜")
  ) {
    return "B";
  }

  return null;
}

function getRoleHeroName(game, player, positionId, fallback) {
  const lineup = player === "A" ? game.lineupA : game.lineupB;
  const heroId = lineup[positionId];
  const hero = heroId ? getHeroById(heroId) : null;
  return hero?.name || fallback;
}

function buildFallbackLineupCommentary(game) {
  const blueLord = getRoleHeroName(game, "A", "lord", "蓝方主公");
  const blueStrategist = getRoleHeroName(game, "A", "strategist", "蓝方军师");
  const blueCommander = getRoleHeroName(game, "A", "commander", "蓝方元帅");
  const redLord = getRoleHeroName(game, "B", "lord", "红方主公");
  const redStrategist = getRoleHeroName(game, "B", "strategist", "红方军师");
  const redCommander = getRoleHeroName(game, "B", "commander", "红方元帅");

  return [
    `蓝方这套阵容由 ${blueLord} 坐镇主公位，${blueStrategist} 和 ${blueCommander} 把中枢节奏撑了起来，整体看起来更像一套先稳住中军、再慢慢把侧翼资源调动开的配置。只要先锋和骑兵能顺利把第一波接战顶住，蓝方后续的联动空间会越打越宽。`,
    `红方则是 ${redLord} 挂帅，${redStrategist} 与 ${redCommander} 负责把进攻节奏拧成一股绳，这边的优点是爆发点更集中，真打起来更容易先把压力砸到某一个位置上。但红方也更吃关键位发挥，一旦前几轮冲击没能打开局面，整条推进线就容易被拖慢。`,
    `眼下最值得看的，还是双方中军调度和侧翼突击谁先占住主动。蓝方若能把阵型稳住，比赛会进入配合取胜的节奏；红方若先手撕开缺口，局势就会很快转成强压对抗。`,
  ].join("\n\n");
}

function buildBattleLoadingLines(game) {
  const blueLord = getRoleHeroName(game, "A", "lord", "蓝军主公");
  const blueCommander = getRoleHeroName(game, "A", "commander", "蓝军主帅");
  const blueStrategist = getRoleHeroName(game, "A", "strategist", "蓝军军师");
  const redLord = getRoleHeroName(game, "B", "lord", "红军主公");
  const redCommander = getRoleHeroName(game, "B", "commander", "红军主帅");
  const redStrategist = getRoleHeroName(game, "B", "strategist", "红军军师");

  return [
    "蓝军正在准备粮草，后营火光连成一线。",
    `${blueCommander}正在点兵，校场上的旗号一面面展开。`,
    `${blueLord}正在鼓舞士气，前军呼声越来越高。`,
    `${blueStrategist}正在推演战局，案上的沙盘已换了三次。`,
    "蓝军斥候刚刚回营，正在汇报敌军动向。",
    "蓝军骑兵正在整备马具，准备随时突击。",
    "蓝军水军正在检查舟楫，暗流中的号角若隐若现。",
    "蓝军先锋正在磨枪试刃，营门前的杀气越来越重。",
    "红军正在调运军械，辎重车一辆接一辆驶入中军。",
    `${redCommander}正在巡阵，亲自确认每一支部队的位置。`,
    `${redLord}正在鼓舞士气，中军大旗始终没有落下。`,
    `${redStrategist}正在密议奇策，帐内灯火通明。`,
    "红军探马刚刚归来，战场另一侧的风声开始变化。",
    "红军弓弩手正在校准射角，箭囊被重新填满。",
    "红军骑阵正在压低速度，等待最合适的冲锋时机。",
    "红军后勤正在清点补给，军粮和药材被逐项复核。",
    "双方间谍都已潜入暗处，第一条假消息即将放出。",
    "中军号鼓尚未擂响，但每个人都听见了大战将至。",
    "帅帐之外风声渐急，真正的决断正在成形。",
    "两军最后一次整队即将结束，战报生成进入倒计时。",
  ];
}

function buildBattleLoadingSegments(game) {
  const blueLord = getRoleHeroName(game, "A", "lord", "蓝军主公");
  const blueCommander = getRoleHeroName(game, "A", "commander", "蓝军主帅");
  const blueStrategist = getRoleHeroName(game, "A", "strategist", "蓝军军师");
  const redLord = getRoleHeroName(game, "B", "lord", "红军主公");
  const redCommander = getRoleHeroName(game, "B", "commander", "红军主帅");
  const redStrategist = getRoleHeroName(game, "B", "strategist", "红军军师");

  return [
    [{ text: "蓝军", tone: "blue" }, { text: "正在准备粮草，后营火光连成一线。" }],
    [{ text: blueCommander, tone: "hero" }, { text: "正在点兵，校场上的旗号一面面展开。" }],
    [{ text: blueLord, tone: "hero" }, { text: "正在鼓舞士气，前军呼声越来越高。" }],
    [{ text: blueStrategist, tone: "hero" }, { text: "正在推演战局，案上的沙盘已换了三次。" }],
    [{ text: "蓝军", tone: "blue" }, { text: "斥候刚刚回营，正在汇报敌军动向。" }],
    [{ text: "蓝军", tone: "blue" }, { text: "骑兵正在整备马具，准备随时突击。" }],
    [{ text: "蓝军", tone: "blue" }, { text: "水军正在检查舟楫，暗流中的号角若隐若现。" }],
    [{ text: "蓝军", tone: "blue" }, { text: "先锋正在磨枪试刃，营门前的杀气越来越重。" }],
    [{ text: "红军", tone: "red" }, { text: "正在调运军械，辎重车一辆接一辆驶入中军。" }],
    [{ text: redCommander, tone: "hero" }, { text: "正在巡阵，亲自确认每一支部队的位置。" }],
    [{ text: redLord, tone: "hero" }, { text: "正在鼓舞士气，中军大旗始终没有落下。" }],
    [{ text: redStrategist, tone: "hero" }, { text: "正在密议奇策，帐内灯火通明。" }],
    [{ text: "红军", tone: "red" }, { text: "探马刚刚归来，战场另一侧的风声开始变化。" }],
    [{ text: "红军", tone: "red" }, { text: "弓弩手正在校准射角，箭囊被重新填满。" }],
    [{ text: "红军", tone: "red" }, { text: "骑阵正在压低速度，等待最合适的冲锋时机。" }],
    [{ text: "红军", tone: "red" }, { text: "后勤正在清点补给，军粮和药材被逐项复核。" }],
    [{ text: "双方间谍", tone: "neutral" }, { text: "都已潜入暗处，第一条假消息即将放出。" }],
    [{ text: "中军号鼓", tone: "neutral" }, { text: "尚未擂响，但每个人都听见了大战将至。" }],
    [{ text: "帅帐之外", tone: "neutral" }, { text: "风声渐急，真正的决断正在成形。" }],
    [{ text: "两军", tone: "neutral" }, { text: "最后一次整队即将结束，战报生成进入倒计时。" }],
  ];
}

function App() {
  const [game, setGame] = useState(createInitialGameState);
  const [activeModal, setActiveModal] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [battleMarkdown, setBattleMarkdown] = useState("");
  const [displayedBattleMarkdown, setDisplayedBattleMarkdown] = useState("");
  const [battleWinner, setBattleWinner] = useState(null);
  const [battleRevealStarted, setBattleRevealStarted] = useState(false);
  const [isAiStreaming, setIsAiStreaming] = useState(false);
  const [isAiDraftThinking, setIsAiDraftThinking] = useState(false);
  const [aiDraftFeedback, setAiDraftFeedback] = useState(null);
  const [lineupCommentary, setLineupCommentary] = useState("");
  const [lineupCommentarySource, setLineupCommentarySource] = useState("ai");
  const [isLineupCommentaryLoading, setIsLineupCommentaryLoading] = useState(false);
  const [isLineupCommentaryComplete, setIsLineupCommentaryComplete] = useState(false);
  const [draftTurnFlash, setDraftTurnFlash] = useState(null);
  const [aiDraftHistory, setAiDraftHistory] = useState(() => {
    try {
      const raw = window.localStorage.getItem(AI_DRAFT_LOG_STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [battleBufferCountdown, setBattleBufferCountdown] = useState(BATTLE_BUFFER_MS / 1000);
  const [battleLoadingLineIndex, setBattleLoadingLineIndex] = useState(0);
  const [theme, setTheme] = useState(() => window.localStorage.getItem("sg-theme") || "dark");
  const rollingTimerRef = useRef(null);
  const battleTimerRef = useRef(null);
  const battleTypingTimerRef = useRef(null);
  const battleRevealTimerRef = useRef(null);
  const battleBufferCountdownTimerRef = useRef(null);
  const battleLoadingLineTimerRef = useRef(null);
  const aiActionTimerRef = useRef(null);
  const aiRollStopTimerRef = useRef(null);
  const draftTurnFlashTimerRef = useRef(null);
  const aiDraftThinkingRef = useRef(false);
  const aiPendingPositionRef = useRef(null);
  const aiDraftDecisionRunRef = useRef(0);
  const lastDraftTurnKeyRef = useRef("");
  const lastLineupCommentaryKeyRef = useRef("");
  const battleMarkdownShellRef = useRef(null);
  const battleMarkdownTargetRef = useRef("");
  const isAiStreamingRef = useRef(false);
  const battleRevealStartedRef = useRef(false);

  useEffect(
    () => () => {
      clearInterval(rollingTimerRef.current);
      clearTimeout(battleTimerRef.current);
      clearInterval(battleTypingTimerRef.current);
      clearTimeout(battleRevealTimerRef.current);
      clearInterval(battleBufferCountdownTimerRef.current);
      clearInterval(battleLoadingLineTimerRef.current);
      clearTimeout(aiActionTimerRef.current);
      clearTimeout(aiRollStopTimerRef.current);
      clearTimeout(draftTurnFlashTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("sg-theme", theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(AI_DRAFT_LOG_STORAGE_KEY, JSON.stringify(aiDraftHistory));
  }, [aiDraftHistory]);

  useEffect(() => {
    isAiStreamingRef.current = isAiStreaming;
  }, [isAiStreaming]);

  useEffect(() => {
    aiDraftThinkingRef.current = isAiDraftThinking;
  }, [isAiDraftThinking]);

  useEffect(() => {
    battleRevealStartedRef.current = battleRevealStarted;
  }, [battleRevealStarted]);

  useEffect(() => {
    if (game.phase !== "arrange") {
      lastLineupCommentaryKeyRef.current = "";
      setLineupCommentary("");
      setLineupCommentarySource("ai");
      setIsLineupCommentaryLoading(false);
      setIsLineupCommentaryComplete(false);
      return undefined;
    }

    const commentaryKey = JSON.stringify({
      lineupA: game.lineupA,
      lineupB: game.lineupB,
      playerNames: game.playerNames,
    });

    if (lastLineupCommentaryKeyRef.current === commentaryKey) {
      return undefined;
    }

    lastLineupCommentaryKeyRef.current = commentaryKey;

    const controller = new AbortController();
    let cancelled = false;
    setLineupCommentary("");
    setLineupCommentarySource("ai");
    setIsLineupCommentaryLoading(true);
    setIsLineupCommentaryComplete(false);

    streamLineupCommentary(
      game,
      {
        onChunk(_chunk, fullText) {
          if (cancelled) {
            return;
          }

          setIsLineupCommentaryLoading(false);
          setLineupCommentary(fullText);
        },
        onComplete(text) {
          if (cancelled) {
            return;
          }

          setIsLineupCommentaryLoading(false);
          setLineupCommentary(text);
          setLineupCommentarySource("ai");
          setIsLineupCommentaryComplete(true);
        },
      },
      { signal: controller.signal },
    )
      .then((text) => {
        if (cancelled) {
          return;
        }

        setLineupCommentary(text);
        setLineupCommentarySource("ai");
        setIsLineupCommentaryComplete(true);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        if (typeof error === "object" && error && "name" in error && error.name === "AbortError") {
          return;
        }

        setLineupCommentary(buildFallbackLineupCommentary(game));
        setLineupCommentarySource("fallback");
        setIsLineupCommentaryComplete(true);
        pushToast(error instanceof Error ? error.message : "AI 阵容点评失败");
      })
      .finally(() => {
        if (!cancelled) {
          setIsLineupCommentaryLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [game.phase, game.lineupA, game.lineupB, game.playerNames]);

  useEffect(() => {
    if (game.phase !== "draft") {
      lastDraftTurnKeyRef.current = "";
      clearTimeout(draftTurnFlashTimerRef.current);
      draftTurnFlashTimerRef.current = null;
      setDraftTurnFlash(null);
      return;
    }

    const turnKey = `${game.turnNumber}-${game.currentPlayer}`;
    if (lastDraftTurnKeyRef.current === turnKey) {
      return;
    }

    lastDraftTurnKeyRef.current = turnKey;
    clearTimeout(draftTurnFlashTimerRef.current);

    const label = game.currentPlayer === "A" ? "蓝方点将" : "红方点将";
    const subtitle = `当前轮到 ${getPlayerLabel(game, game.currentPlayer)} 选人`;
    setDraftTurnFlash({
      player: game.currentPlayer,
      label,
      subtitle,
    });

    draftTurnFlashTimerRef.current = window.setTimeout(() => {
      setDraftTurnFlash(null);
      draftTurnFlashTimerRef.current = null;
    }, DRAFT_TURN_FLASH_MS);
  }, [game.phase, game.turnNumber, game.currentPlayer, game.playerNames]);

  useEffect(() => {
    if (!battleMarkdownShellRef.current) {
      return;
    }

    battleMarkdownShellRef.current.scrollTop = battleMarkdownShellRef.current.scrollHeight;
  }, [displayedBattleMarkdown, isAiStreaming]);

  useEffect(() => {
    clearTimeout(aiActionTimerRef.current);
    aiActionTimerRef.current = null;

    if (game.phase !== "draft" || !game.aiPlayers?.[game.currentPlayer]) {
      aiPendingPositionRef.current = null;
      aiDraftThinkingRef.current = false;
      setIsAiDraftThinking(false);
      return;
    }

    aiActionTimerRef.current = window.setTimeout(async () => {
      if (game.isRolling) {
        return;
      }

      if (game.heldHero) {
        const hero = getHeldHero(game);
        if (!hero) {
          return;
        }

        const targetPosition = isPositionValidForHero(game, game.currentPlayer, hero, aiPendingPositionRef.current)
          ? aiPendingPositionRef.current
          : pickAiPosition(game, game.currentPlayer, hero);
        if (!targetPosition) {
          return;
        }

        aiPendingPositionRef.current = targetPosition;
        placeHero(targetPosition, game.currentPlayer);
        return;
      }

      if (game.displayHeroes.length === 0) {
        stopRollingTimer();
        setGame((current) => ({
          ...current,
          isRolling: true,
          selectedDisplayIdx: null,
          displayHeroes: [],
        }));

        rollingTimerRef.current = window.setInterval(() => {
          setGame((current) => ({
            ...current,
            displayHeroes: buildDraftCandidates(current),
          }));
        }, 85);

        const stopDelay = getRandomInt(AI_ROLL_MIN_MS, AI_ROLL_MAX_MS);
        clearTimeout(aiRollStopTimerRef.current);
        aiRollStopTimerRef.current = window.setTimeout(() => {
          stopRollingTimer();
          setGame((current) => ({
            ...current,
            isRolling: false,
            displayHeroes: buildDraftCandidates(current),
          }));
          aiRollStopTimerRef.current = null;
        }, stopDelay);
        return;
      }

      if (aiDraftThinkingRef.current) {
        return;
      }

      const snapshot = game;
      const runId = aiDraftDecisionRunRef.current + 1;
      aiDraftDecisionRunRef.current = runId;
      aiDraftThinkingRef.current = true;
      setIsAiDraftThinking(true);

      try {
        const decision = normalizeAiDraftDecision(snapshot, await chooseDraftDecision(snapshot));
        if (aiDraftDecisionRunRef.current !== runId) {
          return;
        }

        const feedbackEntry = {
          ...decision,
          player: snapshot.currentPlayer,
          playerName: getPlayerName(snapshot, snapshot.currentPlayer),
          turnNumber: snapshot.turnNumber,
          heroName: decision.heroId ? getHeroById(decision.heroId)?.name || decision.heroId : null,
          positionName: decision.positionId ? getPositionName(decision.positionId) : null,
        };
        setAiDraftFeedback(feedbackEntry);
        appendAiDraftHistory(feedbackEntry);

        if (decision.action === "end_turn") {
          aiPendingPositionRef.current = null;
          window.setTimeout(() => {
            setGame((current) => getStateAfterAdvanceTurn(current));
          }, 700);
          return;
        }

        aiPendingPositionRef.current = decision.positionId;
        setGame((current) => ({
          ...current,
          selectedDisplayIdx: current.displayHeroes.findIndex((hero) => hero.id === decision.heroId),
          heldHero: decision.heroId,
        }));
      } catch (error) {
        if (aiDraftDecisionRunRef.current !== runId) {
          return;
        }

        const message = error instanceof Error ? error.message : "DeepSeek draft choice failed";
        const fallbackDecision = buildFallbackAiDecision(snapshot, message);

        const feedbackEntry = {
          ...fallbackDecision,
          player: snapshot.currentPlayer,
          playerName: getPlayerName(snapshot, snapshot.currentPlayer),
          turnNumber: snapshot.turnNumber,
          heroName: fallbackDecision.heroId ? getHeroById(fallbackDecision.heroId)?.name || fallbackDecision.heroId : null,
          positionName: fallbackDecision.positionId ? getPositionName(fallbackDecision.positionId) : null,
        };
        setAiDraftFeedback(feedbackEntry);
        appendAiDraftHistory(feedbackEntry);

        if (fallbackDecision.action === "end_turn") {
          aiPendingPositionRef.current = null;
          window.setTimeout(() => {
            setGame((current) => getStateAfterAdvanceTurn(current));
          }, 700);
          return;
        }

        aiPendingPositionRef.current = fallbackDecision.positionId;
        setGame((current) => ({
          ...current,
          selectedDisplayIdx: current.displayHeroes.findIndex((hero) => hero.id === fallbackDecision.heroId),
          heldHero: fallbackDecision.heroId,
        }));
      } finally {
        if (aiDraftDecisionRunRef.current === runId) {
          aiDraftThinkingRef.current = false;
          setIsAiDraftThinking(false);
        }
      }
    }, game.heldHero ? 900 : game.displayHeroes.length > 0 ? 950 : 800);

    return () => {
      clearTimeout(aiActionTimerRef.current);
      aiActionTimerRef.current = null;
    };
  }, [game]);

  function pushToast(message, type = "error") {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3000);
  }

  function appendAiDraftHistory(entry) {
    setAiDraftHistory((current) => {
      const next = [
        ...current,
        {
          id: `${Date.now()}-${Math.random()}`,
          timestamp: new Date().toISOString(),
          ...entry,
        },
      ];

      return next.slice(-40);
    });
  }

  function clearAiDraftHistory() {
    setAiDraftHistory([]);
    window.localStorage.removeItem(AI_DRAFT_LOG_STORAGE_KEY);
  }

  function stopRollingTimer() {
    clearInterval(rollingTimerRef.current);
    rollingTimerRef.current = null;
  }

  function resetBattleTimer() {
    clearTimeout(battleTimerRef.current);
    battleTimerRef.current = null;
  }

  function resetBattleTypingTimer() {
    clearInterval(battleTypingTimerRef.current);
    battleTypingTimerRef.current = null;
  }

  function resetBattleRevealTimer() {
    clearTimeout(battleRevealTimerRef.current);
    battleRevealTimerRef.current = null;
  }

  function resetBattleBufferUiTimers() {
    clearInterval(battleBufferCountdownTimerRef.current);
    clearInterval(battleLoadingLineTimerRef.current);
    battleBufferCountdownTimerRef.current = null;
    battleLoadingLineTimerRef.current = null;
  }

  function ensureBattleTypingTimer() {
    if (!battleRevealStartedRef.current || battleTypingTimerRef.current) {
      return;
    }

    battleTypingTimerRef.current = window.setInterval(() => {
      setDisplayedBattleMarkdown((current) => {
        const target = battleMarkdownTargetRef.current;

        if (current.length >= target.length) {
          if (!isAiStreamingRef.current) {
            clearInterval(battleTypingTimerRef.current);
            battleTypingTimerRef.current = null;
          }
          return current;
        }

        const nextLength = Math.min(current.length + TYPEWRITER_CHARS_PER_TICK, target.length);
        return target.slice(0, nextLength);
      });
    }, TYPEWRITER_TICK_MS);
  }

  function resetAiActionTimer() {
    clearTimeout(aiActionTimerRef.current);
    aiActionTimerRef.current = null;
    clearTimeout(aiRollStopTimerRef.current);
    aiRollStopTimerRef.current = null;
    aiDraftDecisionRunRef.current += 1;
    aiDraftThinkingRef.current = false;
    aiPendingPositionRef.current = null;
    setIsAiDraftThinking(false);
  }

  function openModal(modalName) {
    setActiveModal(modalName);
  }

  function closeModal() {
    setActiveModal(null);
  }

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  function goHome() {
    stopRollingTimer();
    resetBattleTimer();
    resetBattleTypingTimer();
    resetBattleRevealTimer();
    resetAiActionTimer();
    setActiveModal(null);
    setBattleMarkdown("");
    setDisplayedBattleMarkdown("");
    setBattleRevealStarted(false);
    setBattleBufferCountdown(BATTLE_BUFFER_MS / 1000);
    setBattleLoadingLineIndex(0);
    battleRevealStartedRef.current = false;
    battleMarkdownTargetRef.current = "";
    setBattleWinner(null);
    setIsAiStreaming(false);
    setAiDraftFeedback(null);
    setLineupCommentary("");
    setLineupCommentarySource("ai");
    setIsLineupCommentaryLoading(false);
    setIsLineupCommentaryComplete(false);
    clearAiDraftHistory();
    setGame((current) => ({
      ...createInitialGameState(),
      playerNames: { ...current.playerNames },
    }));
  }

  function startGame() {
    stopRollingTimer();
    resetBattleTimer();
    resetBattleTypingTimer();
    resetBattleRevealTimer();
    resetAiActionTimer();
    setActiveModal(null);
    setBattleMarkdown("");
    setDisplayedBattleMarkdown("");
    setBattleRevealStarted(false);
    setBattleBufferCountdown(BATTLE_BUFFER_MS / 1000);
    setBattleLoadingLineIndex(0);
    battleRevealStartedRef.current = false;
    battleMarkdownTargetRef.current = "";
    setBattleWinner(null);
    setIsAiStreaming(false);
    setAiDraftFeedback(null);
    setLineupCommentary("");
    setLineupCommentarySource("ai");
    setIsLineupCommentaryLoading(false);
    setIsLineupCommentaryComplete(false);
    clearAiDraftHistory();
    setGame((current) => ({
      ...createInitialGameState(),
      mode: current.mode,
      aiPlayers: { ...current.aiPlayers },
      phase: "draft",
      playerNames: { ...current.playerNames },
    }));
  }

  function updateMode(mode) {
    setGame((current) => {
      const nextIsAi = mode === "ai";
      return {
        ...current,
        mode,
        aiPlayers: {
          A: false,
          B: nextIsAi,
        },
        playerNames: {
          ...current.playerNames,
          B: nextIsAi && (!current.playerNames.B || current.playerNames.B === "玩家 B")
            ? "AI 对手"
            : current.playerNames.B,
        },
      };
    });
  }

  function updatePlayerName(player, value) {
    setGame((current) => ({
      ...current,
      playerNames: {
        ...current.playerNames,
        [player]: value,
      },
    }));
  }

  function startRolling() {
    if (game.aiPlayers?.[game.currentPlayer]) {
      return;
    }

    if (game.heldHero) {
      pushToast("请先把当前已选武将放入阵容。", "info");
      return;
    }

    const available = getAvailableHeroes(game);
    if (available.length < 2) {
      pushToast("可用武将不足，无法继续点将。");
      return;
    }

    stopRollingTimer();
    setGame((current) => ({
      ...current,
      isRolling: true,
      selectedDisplayIdx: null,
      displayHeroes: [],
    }));

    rollingTimerRef.current = window.setInterval(() => {
      setGame((current) => ({
        ...current,
        displayHeroes: buildDraftCandidates(current),
      }));
    }, 85);
  }

  function stopRolling() {
    if (game.aiPlayers?.[game.currentPlayer]) {
      return;
    }

    if (!game.isRolling) {
      return;
    }

    stopRollingTimer();
    setGame((current) => ({
      ...current,
      isRolling: false,
      displayHeroes: buildDraftCandidates(current),
    }));
  }

  function selectDisplayHero(index) {
    if (game.aiPlayers?.[game.currentPlayer]) {
      return;
    }

    if (game.isRolling) {
      return;
    }

    if (game.heldHero && game.selectedDisplayIdx === index) {
      setGame((current) => ({
        ...current,
        heldHero: null,
        selectedDisplayIdx: null,
      }));
      return;
    }

    if (game.heldHero) {
      pushToast("请先放置当前已选武将，或再次点击已选武将取消。", "info");
      return;
    }

    const hero = game.displayHeroes[index];
    if (!hero) {
      return;
    }

    if (isUsed(game, hero.id)) {
      pushToast("这名武将已经在场。");
      return;
    }

    setGame((current) => ({
      ...current,
      selectedDisplayIdx: index,
      heldHero: hero.id,
    }));
  }

  function placeHero(positionId, player) {
    if (game.aiPlayers?.[game.currentPlayer] && player !== game.currentPlayer) {
      return;
    }

    if (game.phase !== "draft" || game.currentPlayer !== player || !game.heldHero) {
      return;
    }

    const hero = getHeroById(game.heldHero);
    const lineup = player === "A" ? game.lineupA : game.lineupB;

    if (positionId === "lord" && hero.color !== "blue") {
      pushToast("主公位只能放蓝色英雄。");
      return;
    }

    if (lineup[positionId]) {
      pushToast("这个位置已经有武将了。");
      return;
    }

    const nextPicks = game.picksThisTurn + 1;
    setGame((current) => {
      const currentLineup = player === "A" ? current.lineupA : current.lineupB;
      return {
        ...current,
        [player === "A" ? "lineupA" : "lineupB"]: {
          ...currentLineup,
          [positionId]: current.heldHero,
        },
        usedHeroes: {
          ...current.usedHeroes,
          [current.heldHero]: true,
        },
        heldHero: null,
        selectedDisplayIdx: null,
        displayHeroes: current.displayHeroes.filter((candidate) => candidate.id !== current.heldHero),
        picksThisTurn: current.picksThisTurn + 1,
      };
    });

    if (nextPicks >= game.maxPicksThisTurn) {
      window.setTimeout(() => {
        setGame((current) => getStateAfterAdvanceTurn(current));
      }, 300);
    }
  }

  function finishPickEarly() {
    if (game.aiPlayers?.[game.currentPlayer]) {
      return;
    }

    setGame((current) => getStateAfterAdvanceTurn(current));
  }

  function submitBattle() {
    if (!canSubmit(game)) {
      pushToast("阵容还不满足提交条件。");
      return;
    }

    if (!isLineupCommentaryComplete || !lineupCommentary.trim()) {
      pushToast("请先等待 AI 阵容点评完成。", "info");
      return;
    }

    if (isAiStreaming) {
      return;
    }

    stopRollingTimer();
    resetBattleTimer();
    resetBattleTypingTimer();
    resetBattleRevealTimer();
    resetBattleBufferUiTimers();
    setBattleMarkdown("");
    setDisplayedBattleMarkdown("");
    setBattleRevealStarted(false);
    setBattleBufferCountdown(BATTLE_BUFFER_MS / 1000);
    setBattleLoadingLineIndex(0);
    battleRevealStartedRef.current = false;
    battleMarkdownTargetRef.current = "";
    setBattleWinner(null);
    setIsAiStreaming(true);
    battleBufferCountdownTimerRef.current = window.setInterval(() => {
      setBattleBufferCountdown((current) => {
        if (current <= 1) {
          clearInterval(battleBufferCountdownTimerRef.current);
          battleBufferCountdownTimerRef.current = null;
          return 0;
        }

        return current - 1;
      });
    }, 1000);
    battleLoadingLineTimerRef.current = window.setInterval(() => {
      setBattleLoadingLineIndex(() => getRandomInt(0, 19));
    }, 3000);
    battleRevealTimerRef.current = window.setTimeout(() => {
      resetBattleBufferUiTimers();
      battleRevealStartedRef.current = true;
      setBattleRevealStarted(true);
      ensureBattleTypingTimer();
    }, BATTLE_BUFFER_MS);

    const snapshot = game;
    battleTimerRef.current = window.setTimeout(async () => {
      try {
        await streamBattleInference(snapshot, {
          onChunk(_text, fullText) {
            battleMarkdownTargetRef.current = fullText;
            setBattleMarkdown(fullText);
            ensureBattleTypingTimer();
          },
          onComplete(fullText) {
            battleMarkdownTargetRef.current = fullText;
            setBattleMarkdown(fullText);
            setBattleWinner(detectBattleWinner(fullText));
            setIsAiStreaming(false);
            ensureBattleTypingTimer();
          },
        });
      } catch (error) {
        resetBattleBufferUiTimers();
        const message = error instanceof Error ? error.message : "AI 推演失败";
        pushToast(message);
        setIsAiStreaming(false);
      }
    }, 200);
  }

  const heldHero = getHeldHero(game);
  const isLineupCommentaryReady = isLineupCommentaryComplete && Boolean(lineupCommentary.trim());
  const canBattleSubmit = canSubmit(game) && isLineupCommentaryReady;
  const isAiTurn = game.phase === "draft" && Boolean(game.aiPlayers?.[game.currentPlayer]);
  const isBattleTyping = displayedBattleMarkdown.length < battleMarkdown.length;
  const showMarkdownBattle = game.phase === "arrange" && (isAiStreaming || battleMarkdown || displayedBattleMarkdown);
  const showVictoryAnimation = Boolean(!isAiStreaming && !isBattleTyping && battleWinner);
  const battleLoadingSegments = buildBattleLoadingSegments(game);
  const showBattleBuffering = game.phase === "arrange" && isAiStreaming && !battleRevealStarted;
  const showAiDraftFeedback =
    isAiTurn && aiDraftFeedback?.player === game.currentPlayer && aiDraftFeedback?.turnNumber === game.turnNumber;
  const showAiDraftHistoryPanel = game.mode === "ai" && aiDraftHistory.length > 0;
  const showDraftTurnFlash = game.phase === "draft" && draftTurnFlash;
  const draftRemainingPicks = Math.max(0, game.maxPicksThisTurn - game.picksThisTurn);
  const showDraftBanner = game.phase === "draft";
  const draftBannerLabel = game.currentPlayer === "A" ? "蓝方点将" : "红方点将";
  const draftBannerText = isAiTurn
    ? `${getPlayerLabel(game, game.currentPlayer)}正在选择武将，本回合还可点 ${draftRemainingPicks} 人`
    : `当前由${getPlayerLabel(game, game.currentPlayer)}选择武将，本回合还可点 ${draftRemainingPicks} 人`;

  return (
    <div className="app-shell">
      <div className="bg-pattern" />
      {PARTICLES.map((particle) => (
        <span
          key={particle.id}
          className="float-particle"
          style={{
            left: particle.left,
            animationDuration: particle.duration,
            animationDelay: particle.delay,
            width: particle.size,
            height: particle.size,
          }}
        />
      ))}

      <div id="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>

      {heldHero && (
        <div className="held-indicator">
          <span className="held-prefix">已选武将</span>
          <span className="held-name" style={{ color: heroColor(heldHero.color) }}>
            {heldHero.name}
          </span>
          <span className="held-title">{heldHero.title}</span>
          <span className="held-tip">
            <i className="fa-solid fa-arrow-left-long" /> 点击空位放置，再点已选武将可取消
          </span>
        </div>
      )}

      {game.phase === "home" && (
        <section className="page active home-page">
          <div className="home-panel">
            <p className="eyebrow">React 重构版</p>
            <h1 className="home-title">三国对抗赛</h1>
            <p className="home-subtitle">策略选将 · AI 推演</p>
            <div className="home-divider" />
            <p className="home-description">
              双人轮流点将与布阵，完成八个位置的阵容后，交给 AI 进行完整战局推演。
              <br />
              当前版本已暂时移除技能卡，流程更直接，点击按钮即可开始点将。
            </p>
            <div className="mode-switcher">
              <button type="button" className={`mode-btn ${game.mode === "pvp" ? "active" : ""}`} onClick={() => updateMode("pvp")}>
                玩家对战
              </button>
              <button type="button" className={`mode-btn ${game.mode === "ai" ? "active" : ""}`} onClick={() => updateMode("ai")}>
                AI 对抗
              </button>
            </div>
            <div className="name-form">
              <label className="name-field">
                <span className="name-label">玩家 A 名字</span>
                <input
                  className="name-input"
                  type="text"
                  maxLength={20}
                  value={game.playerNames.A}
                  onChange={(event) => updatePlayerName("A", event.target.value)}
                  placeholder="请输入玩家 A 名字"
                />
              </label>
              <label className="name-field">
                <span className="name-label">{game.mode === "ai" ? "AI 名字" : "玩家 B 名字"}</span>
                <input
                  className="name-input"
                  type="text"
                  maxLength={20}
                  value={game.playerNames.B}
                  onChange={(event) => updatePlayerName("B", event.target.value)}
                  placeholder="请输入玩家 B 名字"
                />
              </label>
            </div>
            <div className="button-row">
              <button className="btn-primary" onClick={startGame}>
                开始对局
              </button>
              <button className="btn-outline" onClick={toggleTheme}>
                <i className={`fa-solid ${theme === "dark" ? "fa-sun" : "fa-moon"}`} /> {theme === "dark" ? "浅色主题" : "深色主题"}
              </button>
              <button className="btn-outline" onClick={() => openModal("rules")}>
                <i className="fa-solid fa-scroll" /> 规则说明
              </button>
            </div>
          </div>
        </section>
      )}

      {(game.phase === "draft" || game.phase === "arrange") && (
        <section className="page active game-page">
          <header className="game-header">
            <div className="header-brand">
              <span className="brand-mark">三国对抗赛</span>
              <button className="header-link" onClick={() => openModal("rules")}>
                <i className="fa-solid fa-circle-question" /> 规则
              </button>
              <button className="header-link" onClick={toggleTheme}>
                <i className={`fa-solid ${theme === "dark" ? "fa-sun" : "fa-moon"}`} /> {theme === "dark" ? "浅色" : "深色"}
              </button>
            </div>
            <div className={`turn-badge player-${game.currentPlayer.toLowerCase()}`}>
              <i className={`fa-solid ${game.currentPlayer === "A" ? "fa-flag" : "fa-skull-crossbones"}`} />
              {game.phase === "arrange"
                ? "阵容调整阶段"
                : `${getPlayerLabel(game, game.currentPlayer)} · 剩余 ${game.maxPicksThisTurn - game.picksThisTurn} 人`}
            </div>
            <div className="score-info">
              A: {countLineup(game, "A")}/8 | B: {countLineup(game, "B")}/8
            </div>
          </header>

          {showDraftBanner && (
            <div className={`draft-turn-banner player-${game.currentPlayer.toLowerCase()}`}>
              <div className="draft-turn-banner-label">
                <i className={`fa-solid ${game.currentPlayer === "A" ? "fa-shield-halved" : "fa-fire-flame-curved"}`} />
                {draftBannerLabel}
              </div>
              <div className="draft-turn-banner-text">{draftBannerText}</div>
            </div>
          )}

          <main className="game-board">
            <LineupPanel game={game} player="A" onPlaceHero={placeHero} />

            <section className="center-panel">
              <div
                className={`pick-area ${showMarkdownBattle ? "pick-area-report" : ""} ${
                  game.phase === "draft" ? `active-turn active-turn-${game.currentPlayer.toLowerCase()}` : ""
                }`}
              >
                <div className="pick-area-title">
                  {game.phase === "draft" && isAiTurn && `${getPlayerName(game, game.currentPlayer)} 正在点将...`}
                  {game.phase === "arrange" && !showMarkdownBattle && "阵容调整完成，可以开始 AI 推演"}
                  {game.phase === "arrange" && isAiStreaming && "AI 正在推演战局，战报会直接显示在这里"}
                  {game.phase === "arrange" && !isAiStreaming && battleMarkdown && "本次 AI 推演战报"}
                  {game.phase === "draft" && game.isRolling && "点将中... 点击“停止”锁定候选武将"}
                  {game.phase === "draft" &&
                    !game.isRolling &&
                    game.displayHeroes.length > 0 &&
                    `已锁定候选武将，可从中选择（本回合还可选 ${game.maxPicksThisTurn - game.picksThisTurn} 人）`}
                  {game.phase === "draft" &&
                    !game.isRolling &&
                    game.displayHeroes.length === 0 &&
                    "点击下方按钮直接开始点将"}
                </div>

                {game.phase === "draft" && isAiTurn && (isAiDraftThinking || showAiDraftFeedback) && (
                  <div className={`ai-draft-feedback player-${game.currentPlayer.toLowerCase()}`}>
                    <div className="ai-draft-feedback-head">
                      <span className="ai-draft-feedback-title">
                        <i className="fa-solid fa-brain" />
                        DeepSeek V3.2 军师判断
                      </span>
                      {showAiDraftFeedback && aiDraftFeedback.source === "fallback" && (
                        <span className="ai-draft-feedback-badge">兜底</span>
                      )}
                    </div>
                    <div className="ai-draft-feedback-body">
                      {isAiDraftThinking && "正在读取停下的候选武将，并结合当前阵容做选择..."}
                      {!isAiDraftThinking && showAiDraftFeedback && aiDraftFeedback.action === "end_turn" && aiDraftFeedback.feedback}
                      {!isAiDraftThinking && showAiDraftFeedback && aiDraftFeedback.action === "pick" && (
                        <>
                          <div className="ai-draft-feedback-choice">
                            选择：{aiDraftFeedback.heroName} 至 {aiDraftFeedback.positionName}
                          </div>
                          <div>{aiDraftFeedback.feedback}</div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {showDraftTurnFlash && (
                  <div className={`draft-turn-flash-banner draft-turn-flash-banner-${draftTurnFlash.player.toLowerCase()}`}>
                    <div className="draft-turn-flash-glow" />
                    <div className="draft-turn-flash-copy">
                      <span className="draft-turn-flash-label">{draftTurnFlash.label}</span>
                      <span className="draft-turn-flash-subtitle">{draftTurnFlash.subtitle}</span>
                    </div>
                  </div>
                )}

                {showMarkdownBattle ? (
                  <div className="battle-markdown-shell" ref={battleMarkdownShellRef}>
                    {showBattleBuffering && (
                      <div className="battle-buffer-panel">
                        <div className="battle-buffer-countdown">战报载入中 {battleBufferCountdown}s</div>
                        <div className="battle-buffer-line">
                          {battleLoadingSegments[battleLoadingLineIndex].map((segment, index) => (
                            <span
                              key={`${battleLoadingLineIndex}-${index}`}
                              className={`battle-buffer-segment battle-buffer-${segment.tone}`}
                            >
                              {segment.text}
                            </span>
                          ))}
                        </div>
                        <div className="battle-buffer-subline">大幕将启，战局推演正在汇聚各路情报...</div>
                      </div>
                    )}
                    {showVictoryAnimation && (
                      <div className={`victory-banner victory-banner-${battleWinner.toLowerCase()}`}>
                        <div className="victory-glow" />
                        <div className="victory-copy">
                          <span className="victory-label">{battleWinner === "A" ? "蓝方获胜" : "红方获胜"}</span>
                          <span className="victory-subtitle">
                            {battleWinner === "A" ? getPlayerLabel(game, "A") : getPlayerLabel(game, "B")}
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="battle-markdown">
                      <Streamdown plugins={STREAMDOWN_PLUGINS} parseIncompleteMarkdown>
                        {displayedBattleMarkdown || (battleRevealStarted ? "AI 战报正在输出，请稍候..." : "")}
                      </Streamdown>
                    </div>
                  </div>
                ) : game.phase === "arrange" ? (
                  <div className="empty-state">双方阵容已满，点击下方按钮开始 AI 推演。</div>
                ) : game.displayHeroes.length > 0 ? (
                  <div className="hero-cards-row">
                    {game.displayHeroes.map((hero, index) => {
                      const selected = game.selectedDisplayIdx === index;
                      return (
                        <button
                          key={`${hero.id}-${index}`}
                          className={`hero-card ${selected ? "selected" : ""} ${game.isRolling ? "rolling" : "selectable"} ${
                            isAiTurn ? "ai-preview" : ""
                          }`}
                          style={selected ? { borderColor: heroColor(hero.color) } : undefined}
                          onClick={() => selectDisplayHero(index)}
                          disabled={isAiTurn}
                        >
                          <span className="hc-name" style={{ color: heroColor(hero.color) }}>
                            {hero.name}
                          </span>
                          <span className="hc-title">{hero.title}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state">{isAiTurn ? `${getPlayerName(game, game.currentPlayer)} 正在思考阵容...` : "等待点将..."}</div>
                )}
              </div>

              {game.phase === "arrange" && !showMarkdownBattle && (isLineupCommentaryLoading || lineupCommentary) && (
                <section className="lineup-commentary-panel">
                  <div className="lineup-commentary-head">
                    <span className="lineup-commentary-title">
                      <i className="fa-solid fa-comments" /> AI 阵容点评
                    </span>
                    {lineupCommentarySource === "fallback" && (
                      <span className="lineup-commentary-badge">系统草拟</span>
                    )}
                  </div>
                  <div className="lineup-commentary-body">
                    <Streamdown plugins={STREAMDOWN_PLUGINS} parseIncompleteMarkdown>
                      {isLineupCommentaryLoading
                        ? "双方阵容已经落定，军师正在逐位比对核心、联动和短板，请稍候片刻。"
                        : lineupCommentary}
                    </Streamdown>
                  </div>
                </section>
              )}

              <div className="action-bar">
                {game.phase === "draft" && !isAiTurn && (
                  <>
                    {game.isRolling && (
                      <button className="action-btn stop-pick" onClick={stopRolling}>
                        <i className="fa-solid fa-hand" /> 停止
                      </button>
                    )}

                    {!game.isRolling && game.displayHeroes.length === 0 && (
                      <button className="action-btn start-pick" onClick={startRolling}>
                        <i className="fa-solid fa-dice" /> 开始点将
                      </button>
                    )}
                  </>
                )}

                {game.phase === "draft" &&
                  !isAiTurn &&
                  game.picksThisTurn > 0 &&
                  game.picksThisTurn < game.maxPicksThisTurn &&
                  !game.heldHero && (
                    <button className="action-btn confirm" onClick={finishPickEarly}>
                      <i className="fa-solid fa-forward" /> 结束选人（已选 {game.picksThisTurn} 人）
                    </button>
                  )}

                {game.phase === "arrange" && (
                  <>
                    <button className="action-btn submit" onClick={submitBattle} disabled={!canBattleSubmit || isAiStreaming}>
                      <i className="fa-solid fa-wand-sparkles" /> {isAiStreaming ? "AI 推演中..." : battleMarkdown ? "重新推演" : "开始 AI 推演"}
                    </button>
                    {!isAiStreaming && battleMarkdown && (
                      <button className="action-btn skip" onClick={startGame}>
                        <i className="fa-solid fa-rotate-left" /> 重新开始
                      </button>
                    )}
                  </>
                )}
              </div>

              {showAiDraftHistoryPanel && (
                <section className="ai-draft-history-panel">
                  <div className="ai-draft-history-head">
                    <span className="ai-draft-history-title">
                      <i className="fa-solid fa-book-open" />
                      AI 军师札记
                    </span>
                    <span className="ai-draft-history-count">{aiDraftHistory.length} 条</span>
                  </div>
                  <div className="ai-draft-history-list">
                    {[...aiDraftHistory].reverse().map((entry) => (
                      <article key={entry.id} className={`ai-draft-history-item player-${entry.player?.toLowerCase?.() || "b"}`}>
                        <div className="ai-draft-history-meta">
                          <span>{entry.playerName || entry.player}</span>
                          <span>第 {Number(entry.turnNumber ?? 0) + 1} 步</span>
                          <span>{entry.action === "end_turn" ? "结束回合" : `${entry.heroName} -> ${entry.positionName}`}</span>
                        </div>
                        <div className="ai-draft-history-copy">{entry.feedback}</div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </section>

            <LineupPanel game={game} player="B" onPlaceHero={placeHero} />
          </main>

          <footer className="game-footer">{getFooterText(game)}</footer>
        </section>
      )}

      <Modal open={activeModal === "rules"} title="对局规则" onClose={closeModal} width="wide">
        <RulesContent />
      </Modal>
    </div>
  );
}

export default App;
