import { useStore } from "../state/store";
import {
  COSMETICS,
  type Cosmetic,
  type CosmeticSlot,
} from "../game/cosmetics";
import { Coin } from "./Gauges";

const SLOT_LABEL: Record<CosmeticSlot, string> = {
  accent: "Accent color",
  orbSkin: "Companion orb",
  badgeFrame: "Rank frame",
};

const SLOTS: CosmeticSlot[] = ["accent", "orbSkin", "badgeFrame"];

function Swatch({ cosmetic }: { cosmetic: Cosmetic }) {
  const cosmetics = useStore((s) => s.state.cosmetics);
  const gold = useStore((s) => s.state.character.gold);
  const buy = useStore((s) => s.buyCosmetic);
  const equip = useStore((s) => s.equipCosmetic);

  const isDefault = cosmetic.cost === 0;
  const owned = isDefault || cosmetics.owned.includes(cosmetic.id);
  const equipped =
    cosmetics[cosmetic.slot] === cosmetic.value ||
    (isDefault && cosmetics[cosmetic.slot] === "");
  const canBuy = gold >= cosmetic.cost;

  return (
    <div className={`ward ${equipped ? "ward--on" : ""}`}>
      <div className="ward__preview">
        {cosmetic.slot === "accent" ? (
          <span className="ward__dot" style={{ background: cosmetic.value || "#38e6ff" }} />
        ) : (
          <span className="ward__glyph" aria-hidden="true">{"\u25C9"}</span>
        )}
      </div>
      <div className="ward__name">{cosmetic.label}</div>
      {owned ? (
        <button
          className={`btn btn--sm ${equipped ? "btn--ghost" : "btn--primary"}`}
          disabled={equipped}
          onClick={() => equip(cosmetic.id)}
        >
          {equipped ? "Equipped" : "Equip"}
        </button>
      ) : (
        <button className="btn btn--sm" disabled={!canBuy} onClick={() => buy(cosmetic.id)}>
          {cosmetic.cost}
        </button>
      )}
    </div>
  );
}

export function WardrobePanel() {
  const open = useStore((s) => s.wardrobeOpen);
  const setOpen = useStore((s) => s.setWardrobeOpen);
  const gold = useStore((s) => s.state.character.gold);

  if (!open) return null;

  return (
    <>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="sheet">
        <div className="sheet__grip" />
        <div className="sheet__head">
          <span className="sheet__title">Wardrobe</span>
          <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
            {"\u2715"}
          </button>
        </div>

        <div className="sheet__body">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <span className="field__label" style={{ margin: 0 }}>Your gold</span>
            <Coin amount={gold} />
          </div>

          {SLOTS.map((slot) => (
            <div className="field" key={slot}>
              <label className="field__label">{SLOT_LABEL[slot]}</label>
              <div className="ward-grid">
                {COSMETICS.filter((c) => c.slot === slot).map((c) => (
                  <Swatch key={c.id} cosmetic={c} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
