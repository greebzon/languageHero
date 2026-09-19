/** Account experience, shared by every language. Learning mastery is tracked separately. */
export const DEFAULT_MASCOT_LEVELS: Record<string, number> = {
  fox: 1,
  rabbit: 3,
  bear: 5,
  owl: 8,
};

export function levelStartXp(level: number): number {
  const steps = Math.max(0, Math.floor(level) - 1);
  return steps <= 4 ? (steps * (steps + 1) * 100) / 2 : 1000 + (steps - 4) * 500;
}

export function accountLevel(xp: number, minimumLevel = 1) {
  const earned =
    xp < 100 ? 1 : xp < 300 ? 2 : xp < 600 ? 3 : xp < 1000 ? 4 : 5 + Math.floor((xp - 1000) / 500);
  const level = Math.max(earned, minimumLevel);
  return { level, levelStartXp: levelStartXp(level), nextLevelXp: levelStartXp(level + 1) };
}
