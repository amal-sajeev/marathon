import { useEffect, useMemo, useRef, useState } from "react";
import {
  faceCandidates,
  identityCandidates,
  markFaceFailed,
  type Emotion,
} from "./emotions";

/**
 * Leela's small profile picture. It swaps to the art matching her current mood
 * (with a brief glitch on change) and walks a WebP -> PNG -> neutral candidate
 * list, so a mood without art still shows a sensible face. Meant to live inside
 * a fixed-size round/rounded frame.
 *
 * Pass `fixed` for surfaces that should read as her identity rather than her
 * state, which pins the art to neutral-1.
 */
export function FaceAvatar({
  emotion = "neutral",
  crack = 0,
  fixed = false,
}: {
  emotion?: Emotion;
  /** 0..1 fracture overlay, decaying over the day after a missed daily */
  crack?: number;
  /** Pin to her identity art and ignore `emotion`. */
  fixed?: boolean;
}) {
  const candidates = useMemo(
    () => (fixed ? identityCandidates() : faceCandidates(emotion)),
    [emotion, fixed],
  );
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
      {crack > 0 ? (
        <svg
          className="face-av__crack"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ opacity: crack }}
        >
          <g fill="none" strokeLinejoin="miter" vectorEffect="non-scaling-stroke">
            <polyline points="54,-2 47,25 59,37 41,57 49,73 37,102" />
            <polyline points="47,25 20,17" />
            <polyline points="59,37 87,28" />
            <polyline points="41,57 11,63" />
            <polyline points="49,73 78,84" />
          </g>
        </svg>
      ) : null}
    </span>
  );
}
