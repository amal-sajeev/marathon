import { useState } from "react";
import { ASSET_SLOTS } from "../assets/placeholders";

interface Props {
  slot: keyof typeof ASSET_SLOTS;
  className?: string;
}

/**
 * Renders the real asset if present at its /public path, otherwise a labeled
 * skeuomorphic placeholder so the layout is never broken pre-art.
 */
export function AssetImage({ slot, className }: Props) {
  const meta = ASSET_SLOTS[slot];
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={`placeholder ${className ?? ""}`} title={meta.note}>
        <div>
          <div className="placeholder__glyph">{meta.glyph}</div>
          {meta.label}
        </div>
      </div>
    );
  }

  return (
    <img
      className={className}
      src={meta.src}
      alt={meta.label}
      onError={() => setFailed(true)}
    />
  );
}
