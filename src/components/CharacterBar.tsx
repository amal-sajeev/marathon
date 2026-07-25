import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { xpForLevel } from "../state/scoring";
import { rankForLevel } from "../game/ranks";
import { RankBadge } from "./RankBadge";
import { Coin, Tube } from "./Gauges";

export function CharacterBar() {
  const character = useStore((s) => s.state.character);
  const stats = useStore((s) => s.state.stats);
  const xpNeeded = xpForLevel(character.level);
  const rank = rankForLevel(character.level);

  const [showBest, setShowBest] = useState(false);
  useEffect(() => {
    if (!showBest) return;
    const t = window.setTimeout(() => setShowBest(false), 3000);
    return () => window.clearTimeout(t);
  }, [showBest]);

  // Nothing to brag about or lose yet; don't clutter the bar on day one.
  const showStreak = stats.currentStreak > 0 || stats.longestStreak > 0;
  const alive = stats.currentStreak > 0;

  return (
    <div className="hero">
      <div className="hero__portrait">
        <div className="hero__portrait-inner">
          <RankBadge level={character.level} size={54} />
        </div>
      </div>
      <div className="hero__info">
        <div className="hero__name">
          <span>{character.name}</span>
          <span style={{ marginLeft: "auto" }}>
            <Coin amount={character.gold} />
          </span>
        </div>
        <div className="hero__sub">
          <span>
            LV {character.level} &middot; {rank.name}
          </span>
          {showStreak ? (
            <button
              type="button"
              className={`streak ${alive ? "streak--live" : "streak--cold"}`}
              onClick={() => setShowBest((v) => !v)}
              aria-label={
                alive
                  ? `Day streak: ${stats.currentStreak}. Longest: ${stats.longestStreak}.`
                  : `No active streak. Longest: ${stats.longestStreak}.`
              }
            >
              <span className="streak__glyph" aria-hidden="true">
                {"\u25B2"}
              </span>
              {showBest ? `best ${stats.longestStreak}` : `${stats.currentStreak}d`}
            </button>
          ) : null}
        </div>
        <div className="hero__gauges">
          <Tube
            kind="hp"
            icon={"\u2665"}
            value={character.hp}
            max={character.maxHp}
            label={`${Math.round(character.hp)}/${character.maxHp}`}
          />
          <Tube
            kind="xp"
            icon={"\u2726"}
            value={character.xp}
            max={xpNeeded}
            label={`${Math.round(character.xp)}/${xpNeeded}`}
          />
        </div>
      </div>
    </div>
  );
}
