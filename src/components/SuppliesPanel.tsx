import { useStore } from "../state/store";
import { CONSUMABLES, type ConsumableKind } from "../game/cosmetics";
import { xpBuffActive } from "../state/scoring";
import { Coin } from "./Gauges";

const ORDER: ConsumableKind[] = ["hpPotion", "xpCharm", "streakShield"];

export function SuppliesPanel() {
  const open = useStore((s) => s.suppliesOpen);
  const setOpen = useStore((s) => s.setSuppliesOpen);
  const character = useStore((s) => s.state.character);
  const buy = useStore((s) => s.buyConsumable);
  const useHpPotion = useStore((s) => s.useHpPotion);
  const useXpCharm = useStore((s) => s.useXpCharm);

  if (!open) return null;

  const gold = character.gold;
  const buffOn = xpBuffActive(character);

  return (
    <>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="sheet">
        <div className="sheet__grip" />
        <div className="sheet__head">
          <span className="sheet__title">Supplies</span>
          <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
            {"\u2715"}
          </button>
        </div>

        <div className="sheet__body">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <span className="field__label" style={{ margin: 0 }}>Your gold</span>
            <Coin amount={gold} />
          </div>

          {ORDER.map((kind) => {
            const info = CONSUMABLES[kind];
            const count = character.inventory[kind];
            const canBuy = gold >= info.cost;
            const canUse =
              kind === "hpPotion"
                ? count > 0 && character.hp < character.maxHp
                : kind === "xpCharm"
                  ? count > 0
                  : false;
            return (
              <div className="supply" key={kind}>
                <div className="supply__glyph" aria-hidden="true">{info.glyph}</div>
                <div className="supply__body">
                  <div className="supply__name">
                    {info.label}
                    <span className="supply__count">x{count}</span>
                    {kind === "xpCharm" && buffOn && (
                      <span className="chip chip--streak" style={{ marginLeft: 6 }}>active</span>
                    )}
                  </div>
                  <div className="supply__note">{info.note}</div>
                </div>
                <div className="supply__actions">
                  <button
                    className="btn btn--sm"
                    disabled={!canBuy}
                    onClick={() => buy(kind)}
                  >
                    Buy {info.cost}
                  </button>
                  {(kind === "hpPotion" || kind === "xpCharm") && (
                    <button
                      className="btn btn--primary btn--sm"
                      disabled={!canUse}
                      onClick={() => (kind === "hpPotion" ? useHpPotion() : useXpCharm())}
                    >
                      Use
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          <div className="hint" style={{ marginTop: 12 }}>
            Streak shields are spent automatically overnight if you miss a day, so
            your streak survives the odd off day. HP damage still applies.
          </div>
        </div>
      </div>
    </>
  );
}
