"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RULES = exports.LANE_LEN = exports.SAFE = exports.START = exports.ENTRY = exports.COLOR_ORDER = exports.TRACK_LEN = void 0;
exports.TRACK_LEN = 68;
exports.COLOR_ORDER = ['red', 'blue', 'yellow', 'green'];
exports.ENTRY = { red: 68, blue: 17, yellow: 34, green: 51 };
exports.START = { red: 5, blue: 22, yellow: 39, green: 56 };
exports.SAFE = new Set([5, 12, 17, 22, 29, 34, 39, 46, 51, 56, 63, 68]);
exports.LANE_LEN = 7;
exports.RULES = {
    exitRoll: 5,
    captureBonus: 20,
    goalBonus: 10,
    homeAttempts: 3,
    sixGivesExtraRoll: true,
    threeSixesPenalty: true,
    mustBreakBarrierOnSix: true,
    exitCapturesOnStart: true,
    turnTimeoutMs: 0,
};
//# sourceMappingURL=game-rules.config.js.map