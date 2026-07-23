import type { Difficulty } from "../state/types";

const ORDER: Difficulty[] = ["trivial", "easy", "medium", "hard"];

export function DifficultyPips({ difficulty }: { difficulty: Difficulty }) {
  const level = ORDER.indexOf(difficulty) + 1;
  return (
    <span className="pips" title={difficulty}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`pip ${i < level ? "pip--on" : ""}`} />
      ))}
    </span>
  );
}
