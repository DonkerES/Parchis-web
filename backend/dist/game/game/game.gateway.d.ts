import { Server, Socket } from 'socket.io';
import { RoomsService } from '../../rooms/rooms.service';
import { GameService } from '../game.service';
export declare class GameGateway {
    private readonly gameService;
    private readonly roomsService;
    server: Server;
    private readonly countdownTimers;
    constructor(gameService: GameService, roomsService: RoomsService);
    handleStart(data: {
        playerName: string;
    }, client: Socket): void;
    handleRoll(data: {
        playerName: string;
    }, client: Socket): void;
    handleMove(data: {
        pieceId: string;
        playerName: string;
    }, client: Socket): void;
    handleSync(client: Socket): void;
    handleGameLeave(data: {
        roomId: string;
        playerName?: string;
    }, client: Socket): void;
    private broadcastPlayers;
}
