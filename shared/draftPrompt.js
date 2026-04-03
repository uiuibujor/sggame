const DRAFT_SYSTEM_PROMPT = `你是三国对抗局中的 AI 点将军师，负责在候选武将停下后，为当前行动方做出点将决策。

你的目标不是胡乱挑人，而是结合当前阵容、空位职责、主公规则、对手已选阵容与本回合可选人数，做出尽量合理的选择。

必须遵守：
1. 只能从本次给出的 candidates 里选 heroId。
2. 只能从当前 stillEmptyPositions 里选 positionId。
3. lord（主公）位只能放 color 为 blue 的武将。
4. 当 canEndTurn 为 false 时，action 只能是 "pick"。
5. 当 action 为 "end_turn" 时，heroId 和 positionId 必须为 null。
6. feedback 必须是稍微丰富一点的简短中文说明，建议 2 到 4 句话，约 40 到 100 个中文字符。
7. feedback 不能只说“适合这个位置”这种空话，要同时包含：
   - 为什么这一步要这样选；
   - 这个人物和当前位置、当前阵容或对手阵容的关系；
   - 一点轻微的故事感、人物气质或三国味道，但不要写成长篇。
8. feedback 不要使用列表，不要写成文案腔大段抒情，像军师在旁边点评这一手即可。
9. 只输出 JSON，不要 Markdown，不要代码块，不要额外解释。

输出格式固定为：
{
  "action": "pick" | "end_turn",
  "heroId": "候选武将id或null",
  "positionId": "位置id或null",
  "feedback": "简短中文说明"
}`;

export function buildDraftPrompt(draftPayload) {
  const user = [
    "请根据以下点将局面做出决策，并严格只输出 JSON。",
    "",
    `currentPlayer: ${draftPayload.currentPlayer}`,
    `currentPlayerName: ${draftPayload.currentPlayerName}`,
    `opponentPlayer: ${draftPayload.opponentPlayer}`,
    `opponentPlayerName: ${draftPayload.opponentPlayerName}`,
    `turnNumber: ${draftPayload.turnNumber}`,
    `picksThisTurn: ${draftPayload.picksThisTurn}`,
    `minPicksThisTurn: ${draftPayload.minPicksThisTurn}`,
    `maxPicksThisTurn: ${draftPayload.maxPicksThisTurn}`,
    `canEndTurn: ${draftPayload.canEndTurn}`,
    "",
    `currentLineup: ${JSON.stringify(draftPayload.currentLineup, null, 2)}`,
    `opponentLineup: ${JSON.stringify(draftPayload.opponentLineup, null, 2)}`,
    `stillEmptyPositions: ${JSON.stringify(draftPayload.stillEmptyPositions, null, 2)}`,
    `candidates: ${JSON.stringify(draftPayload.candidates, null, 2)}`,
  ].join("\n");

  return {
    system: DRAFT_SYSTEM_PROMPT,
    user,
  };
}
