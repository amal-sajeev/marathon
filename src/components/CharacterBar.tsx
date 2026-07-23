import { useStore } from "../state/store";
import { xpForLevel } from "../state/scoring";
import { rankForLevel } from "../game/ranks";
import { RankBadge } from "./RankBadge";
import { Coin, Tube } from "./Gauges";

export function CharacterBar() {
  const character = useStore((s) => s.state.character);
  const xpNeeded = xpForLevel(character.level);
  const rank = rankForLevel(character.level);

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
          LV {character.level} &middot; {rank.name}
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
