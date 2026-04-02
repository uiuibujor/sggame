import { PLAYER_META, POSITIONS } from "../data/gameData";
import { getHeldHero, getHeroById, getLineup, getPlayerLabel, heroColor } from "../lib/gameLogic";

function LineupPanel({ game, player, onPlaceHero }) {
  const lineup = getLineup(game, player);
  const isCurrentTurn = game.currentPlayer === player && game.phase === "draft";
  const heldHero = getHeldHero(game);

  return (
    <section className={`lineup-panel ${isCurrentTurn ? `active-turn active-turn-${player.toLowerCase()}` : ""}`}>
      <div className={`panel-title ${player === "A" ? "a-title" : "b-title"}`}>
        <i className={`fa-solid ${PLAYER_META[player].panelIcon}`} /> {getPlayerLabel(game, player)}
      </div>

      <div className="lineup-grid">
        {POSITIONS.map((position) => {
          const positionName = position.id === "commander" ? "主帅" : position.name;
          const heroId = lineup[position.id];
          const hero = heroId ? getHeroById(heroId) : null;
          const shouldHighlight = isCurrentTurn && !hero && heldHero;
          const invalidLord = shouldHighlight && position.id === "lord" && heldHero?.color !== "blue";

          return (
            <button
              key={position.id}
              className={`lineup-slot ${hero ? "filled" : ""} ${shouldHighlight && !invalidLord ? "highlight" : ""} ${
                invalidLord ? "highlight-invalid" : ""
              }`}
              onClick={() => {
                if (!invalidLord) {
                  onPlaceHero(position.id, player);
                }
              }}
              disabled={!shouldHighlight || invalidLord}
            >
              <span className="slot-label">
                <i className={`fa-solid ${position.icon}`} /> {positionName}
              </span>

              {hero ? (
                <>
                  <span className="slot-hero-name" style={{ color: heroColor(hero.color) }}>
                    {hero.name}
                  </span>
                  <span className="slot-hero-title">{hero.title}</span>
                </>
              ) : (
                <span className="slot-empty">空</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default LineupPanel;
