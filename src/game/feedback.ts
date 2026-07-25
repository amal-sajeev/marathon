/**
 * The half-second of sensory reward that follows a win.
 *
 * Kept in one place so the intensity switch and the reduced-motion preference
 * have a single thing to turn off, rather than a dozen call sites each
 * remembering to check.
 */

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * A short buzz. Unsupported on desktop and on iOS Safari, where it's a no-op
 * rather than an error, so there's nothing to feature-detect around.
 */
export function buzz(pattern: number | number[]): void {
  if (reducedMotion()) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* some browsers throw when the page isn't user-activated */
  }
}

/** Something good happened. */
export function buzzGain(): void {
  buzz(18);
}

/** Something rarer happened: a level, a milestone, a box. */
export function buzzMilestone(): void {
  buzz([0, 30, 60, 40]);
}

/**
 * Flash a class onto an element for the length of its animation.
 *
 * Removing and re-adding on the next frame restarts the animation, which
 * matters when two wins land in quick succession.
 */
export function flash(el: Element | null, className: string, ms = 900): void {
  if (!el || reducedMotion()) return;
  el.classList.remove(className);
  requestAnimationFrame(() => {
    el.classList.add(className);
    window.setTimeout(() => el.classList.remove(className), ms);
  });
}

/** Her portrait pulses and the character bar catches the light. */
export function glimmer(): void {
  flash(document.querySelector(".agent-fab"), "glimmer");
  flash(document.querySelector(".chat__headicon"), "glimmer");
  flash(document.querySelector(".hero"), "hero--gold");
}
