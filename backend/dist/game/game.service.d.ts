import { type Color } from './game-rules.config';
import type { GameEvent, GameState } from './game-engine.types';
export declare function playerColors(count: number): Color[];
export declare class GameService {
    private readonly states;
    private readonly players;
    private readonly countdownTimers;
    createState(roomId: string, names: string[]): GameState;
    getState(roomId: string): GameState | null;
    removeRoom(roomId: string): void;
    getColorForPlayer(roomId: string, playerName: string): Color | null;
    getPlayerNameForColor(roomId: string, color: Color): string | null;
    setSocketPlayer(roomId: string, playerName: string, socketId: string): void;
    roll(roomId: string, playerName: string): {
        state: GameState;
        value?: number;
        error?: {
            code: string;
            message: string;
        };
        events?: GameEvent[];
    };
    move(roomId: string, playerName: string, pieceId: string): {
        state: GameState;
        error?: {
            code: string;
            message: string;
        };
        events?: GameEvent[];
    };
    private applyMove;
    private setBonus;
    private finishTurn;
    removePlayer(roomId: string, playerName: string): {
        gameOver: boolean;
        winner: Color | null;
    };
}
