import { useEffect, useState } from "react";
import { boxExpired, useStore } from "../state/store";
import { CONSUMABLES, type ConsumableKind } from "../game/cosmetics";
import { xpBuffActive } from "../state/scoring";
import { Coin } from "./Gauges";

const ORDER: ConsumableKind[] = ["hpPotion", "xpCharm", "streakShield"];

/** Milestones worth betting on, and the next one they haven't reached. */
const WAGER_TARGETS = [7, 14, 30, 60, 100];
const WAGER_STAKES = [25, 50, 100];

function hoursLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "gone";
  const h = Math.floor(ms / 3_600_000);
  if (h >= 1) return `${h}h left`;
  return `${Math.max(1, Math.round(ms / 60_000))}m left`;
}

/**
 * A box from her for three days of conversation in a row, good for 24 hours.
 *
 * The window is the whole mechanic; a box that waits forever is just an
 * unread notification.
 */
function MysteryBox() {
  const eng = useStore((s) => s.state.engagement);
  const openBox = useStore((s) => s.openMysteryBox);
  const expire = useStore((s) => s.expireMysteryBox);
  const pushToast = useStore((s) => s.pushToast);
  const [, tick] = useState(0);

  const expiresAt = eng.boxExpiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const id = window.setInterval(() => tick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  useEffect(() => {
    if (boxExpired(eng)) expire();
  }, [eng, expire]);

  if (!eng.boxPending || boxExpired(eng)) return null;

  return (
    <div className="supply supply--box">
      <div className="supply__glyph" aria-hidden="true">{"\u2726"}</div>
      <div className="supply__body">
        <div className="supply__name">
          Something from Leela
          {expiresAt ? <span className="supply__count">{hoursLeft(expiresAt)}</span> : null}
        </div>
        <div className="supply__note">
          Three days of talking in a row. She won't say what's in it.
        </div>
      </div>
      <div className="supply__actions">
        <button
          className="btn btn--primary btn--sm"
          onClick={() => {
            const got = openBox();
            if (got) pushToast(`She gave you ${got.text}.`, "gain");
          }}
        >
          Open
        </button>
      </div>
    </div>
  );
}

/** Gold staked on reaching a streak milestone. Never health. */
function StreakWagerCard() {
  const eng = useStore((s) => s.state.engagement);
  const stats = useStore((s) => s.state.stats);
  const gold = useStore((s) => s.state.character.gold);
  const place = useStore((s) => s.placeWager);
  const cancel = useStore((s) => s.cancelWager);
  const pushToast = useStore((s) => s.pushToast);
  const [stake, setStake] = useState(WAGER_STAKES[0]);

  const bet = eng.wager;
  if (bet) {
    return (
      <div className="supply supply--wager">
        <div className="supply__glyph" aria-hidden="true">{"\u25C6"}</div>
        <div className="supply__body">
          <div className="supply__name">
            Wager
            <span className="supply__count">
              {stats.currentStreak} / {bet.target}
            </span>
          </div>
          <div className="supply__note">
            {bet.stake} gold on reaching {bet.target} days. Pays {bet.stake * 2} if
            you get there, gone if the streak breaks.
          </div>
        </div>
        <div className="supply__actions">
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => {
              cancel();
              pushToast(`Wager pulled. ${bet.stake} gold back.`, "info");
            }}
          >
            Pull out
          </button>
        </div>
      </div>
    );
  }

  const target = WAGER_TARGETS.find((t) => t > stats.currentStreak);
  if (!target) return null;

  return (
    <div className="supply supply--wager">
      <div className="supply__glyph" aria-hidden="true">{"\u25C7"}</div>
      <div className="supply__body">
        <div className="supply__name">Wager on your streak</div>
        <div className="supply__note">
          Stake gold on reaching {target} days. Double it if you do, lose it if the
          streak breaks. You can pull out any time before then.
        </div>
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          {WAGER_STAKES.map((v) => (
            <button
              key={v}
              className={`btn btn--sm ${stake === v ? "btn--primary" : ""}`}
              disabled={gold < v}
              onClick={() => setStake(v)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="supply__actions">
        <button
          className="btn btn--sm"
          disabled={gold < stake}
          onClick={() => {
            if (place(stake, target)) {
              pushToast(`${stake} gold on ${target} days. No pressure.`, "info");
            }
          }}
        >
          Stake
        </button>
      </div>
    </div>
  );
}

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

          <MysteryBox />
          <StreakWagerCard />

          <div className="hint" style={{ marginTop: 12 }}>
            Streak shields are spent automatically overnight if you miss a day, so
            your streak survives the odd off day. HP damage still applies.
          </div>
        </div>
      </div>
    </>
  );
}
