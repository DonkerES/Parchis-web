export const TRACK_LEN = 68;
export const COLOR_ORDER = ['red', 'blue', 'yellow', 'green'] as const;
export type Color = (typeof COLOR_ORDER)[number];

export const ENTRY = { red: 68, blue: 17, yellow: 34, green: 51 } as const;
export const START = { red: 5, blue: 22, yellow: 39, green: 56 } as const;
export const SAFE = new Set([5, 12, 17, 22, 29, 34, 39, 46, 51, 56, 63, 68]);
export const LANE_LEN = 7;
export const RULES = {
  exitRoll: 5,
  captureBonus: 20,
  goalBonus: 10,
  homeAttempts: 3,
  sixGivesExtraRoll: true,
  threeSixesPenalty: true,
  mustBreakBarrierOnSix: true,
  exitCapturesOnStart: true,
  turnTimeoutMs: 0,
} as const;

