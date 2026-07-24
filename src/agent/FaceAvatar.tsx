import { useEffect, useMemo, useRef, useState } from "react";
import { faceCandidates, markFaceFailed, type Emotion } from "./emotions";

/**
 * Leela's small profile picture. It swaps to the art matching her current mood
 * (with a brief glitch on change) and walks a WebP -> PNG -> neutral candidate
 * list, so a mood without art still shows a sensible face. Meant to live inside
 * a fixed-size round/rounded frame.
 */
export function FaceAvatar({ emotion }: { emotion: Emotion }) {
  const candidates = useMemo(() => faceCandidates(emotion), [emotion]);
  const [idx, setIdx] = useState(0);
  const [glitch, setGlitch] = useState(false);
  const prev = useRef<Emotion>(emotion);

  useEffect(() => {
    setIdx(0);
    if (prev.current === emotion) return;
    prev.current = emotion;
    setGlitch(true);
    const t = window.setTimeout(() => setGlitch(false), 380);
    return () => window.clearTimeout(t);
  }, [emotion]);

  const src = candidates[Math.min(idx, candidates.length - 1)];

  const onError = () => {
    markFaceFailed(src);
    setIdx((i) => (i < candidates.length - 1 ? i + 1 : i));
  };

  return (
    <span className={`face-av ${glitch ? "face-av--glitch" : ""}`} aria-hidden="true">
      <img src={src} alt="" onError={onError} />
    </span>
  );
}
