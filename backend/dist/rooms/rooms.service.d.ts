export type RoomPhase = 'waiting' | 'countdown' | 'playing' | 'finished';
export type MaxPlayers = 2 | 3 | 4;
export interface RoomSummary {
    id: string;
    name: string;
    players: number;
    maxPlayers: MaxPlayers;
    hasPassword: boolean;
    phase: RoomPhase;
}
export interface RoomError {
    code: 'ROOM_FULL' | 'WRONG_PASSWORD' | 'ROOM_NOT_FOUND' | 'GAME_IN_PROGRESS' | 'INVALID_DATA' | 'NOT_ENOUGH_PLAYERS' | 'NOT_HOST' | 'NOT_YOUR_TURN' | 'INVALID_MOVE' | 'WRONG_PHASE';
    message: string;
}
export declare class RoomsService {
    private readonly rooms;
    list(): RoomSummary[];
    getPlayers(roomId: string): string[];
    getState(roomId: string): {
        players: string[];
        hostName: string | null;
        phase: RoomPhase;
    } | null;
    getHostName(roomId: string): string | null;
    getPlayerCount(roomId: string): number;
    setPhase(roomId: string, phase: RoomPhase): void;
    getPhase(roomId: string): RoomPhase | null;
    create(data: {
        name: string;
        maxPlayers: MaxPlayers;
        password?: string;
        playerName?: string;
    }): {
        roomId: string;
    } | {
        error: RoomError;
    };
    join(roomId: string, playerName: string, password?: string): {
        roomId: string;
        playerId: string;
    } | {
        error: RoomError;
    };
    leave(roomId: string, playerName?: string): void;
    start(roomId: string, playerName: string): {
        phase: RoomPhase;
    } | {
        error: RoomError;
    };
}
