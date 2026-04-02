import { POSITIONS } from "../data/gameData";
import { getPositionRoleHint } from "../lib/gameLogic";

function RulesContent() {
  return (
    <div className="rules-layout">
      <section className="rule-section">
        <h3>
          <i className="fa-solid fa-chess-board" /> 阵容结构
        </h3>
        <p>双方各有 8 个位置，全部填满后才能进入最终 AI 推演。</p>
        <table className="rule-table">
          <thead>
            <tr>
              <th>位置</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {POSITIONS.map((position) => {
              const positionName = position.id === "commander" ? "主帅" : position.name;
              return (
              <tr key={position.id}>
                <td>
                  <i className={`fa-solid ${position.icon}`} /> {positionName}
                </td>
                <td>{getPositionRoleHint(position.id)}</td>
              </tr>
            )})}
          </tbody>
        </table>
      </section>

      <section className="rule-section">
        <h3>
          <i className="fa-solid fa-arrow-right-arrow-left" /> 选人顺序
        </h3>
        <ul>
          <li>开局由擂主玩家 A 先选，可选 1 到 2 人。</li>
          <li>之后进入循环：挑战者玩家 B 连续进行 2 次点将，每次可选 1 到 2 人。</li>
          <li>接着由擂主玩家 A 连续进行 2 次点将，每次可选 1 到 2 人。</li>
          <li>以上按 B、B、A、A 的顺序反复循环，直到双方阵容补满。</li>
        </ul>
      </section>

      <section className="rule-section">
        <h3>
          <i className="fa-solid fa-dice" /> 点将
        </h3>
        <p>点击“开始点将”后会滚动出现候选武将，停止后从候选中选出 1 名，再放入当前玩家的空位。</p>
      </section>

      <section className="rule-section">
        <h3>
          <i className="fa-solid fa-trophy" /> 胜负判定
        </h3>
        <p>对战不再依赖人物固定数值。最终胜负完全交给 AI 根据阵容、位置、人物关系和战场过程进行推演，并输出战报、结果与关键人物。</p>
      </section>
    </div>
  );
}

export default RulesContent;
