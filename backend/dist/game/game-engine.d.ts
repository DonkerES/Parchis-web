import { type Color } from './game-rules.config';
import type { GameState, LegalMove } from './game-engine.types';
export declare function trackSquare(color: Color, progress: number): number;
export declare function createInitialState(roomId: string, presentColors: Color[]): GameState;
export declare function barrierAt(state: GameState, square: number): boolean;
export declare function legalMoves(state: GameState, color: Color, steps: number, isBonus?: boolean): LegalMove[];
export declare function nextColor(current: Color, presentColors: Color[]): Color;
