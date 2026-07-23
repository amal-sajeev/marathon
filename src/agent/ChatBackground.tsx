import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { faceCandidates, markFaceFailed, type Emotion } from "./emotions";

/**
 * Ambient emotion art behind the chat. The image swaps to match Leela's current
 * mood, and each change fires a brief glitch transition so it feels like a
 * living presence rather than a static backdrop. It walks a WebP -> PNG ->
 * neutral candidate list, so an emotion without art (or in either format) still
 * shows something sensible.
 */
export function ChatBackground({ emotion }: { emotion: Emotion }) {
  const candidates = useMemo(() => faceCandidates(emotion), [emotion]);
  const [idx, setIdx] = useState(0);
  const [glitch, setGlitch] = useState(false);
  const prev = useRef<Emotion>(emotion);

  useEffect(() => {
    setIdx(0);
    if (prev.current === emotion) return;
    prev.current = emotion;
    setGlitch(true);
    const t = window.setTimeout(() => setGlitch(false), 440);
    return () => window.clearTimeout(t);
  }, [emotion]);

  const src = candidates[Math.min(idx, candidates.length - 1)];

  const onError = (_e: SyntheticEvent<HTMLImageElement>) => {
    markFaceFailed(src);
    setIdx((i) => (i < candidates.length - 1 ? i + 1 : i));
  };

  return (
    <div
      className={`chat__bg ${glitch ? "chat__bg--glitch" : ""}`}
      aria-hidden="true"
    >
      <img className="chat__bg-img" src={src} alt="" onError={onError} />
      <div className="chat__bg-noise" />
      <div className="chat__bg-scrim" />
    </div>
  );
}
