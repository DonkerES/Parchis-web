export declare const TRACK_LEN = 68;
export declare const COLOR_ORDER: readonly ["red", "blue", "yellow", "green"];
export type Color = (typeof COLOR_ORDER)[number];
export declare const ENTRY: {
    readonly red: 68;
    readonly blue: 17;
    readonly yellow: 34;
    readonly green: 51;
};
export declare const START: {
    readonly red: 5;
    readonly blue: 22;
    readonly yellow: 39;
    readonly green: 56;
};
export declare const SAFE: Set<number>;
export declare const LANE_LEN = 7;
export declare const RULES: {
    readonly exitRoll: 5;
    readonly captureBonus: 20;
    readonly goalBonus: 10;
    readonly homeAttempts: 3;
    readonly sixGivesExtraRoll: true;
    readonly threeSixesPenalty: true;
    readonly mustBreakBarrierOnSix: true;
    readonly exitCapturesOnStart: true;
    readonly turnTimeoutMs: 0;
};
