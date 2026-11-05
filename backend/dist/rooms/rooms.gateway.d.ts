import { OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MaxPlayers, RoomError, RoomPhase, RoomsService } from './rooms.service';
interface CreateRoomData {
    name: string;
    maxPlayers: MaxPlayers;
    password?: string;
    playerName?: string;
}
interface JoinRoomData {
    roomId: string;
    playerName: string;
    password?: string;
}
interface LeaveRoomData {
    roomId: string;
    playerName?: string;
}
interface StartRoomData {
    roomId: string;
    playerName: string;
}
export declare class RoomsGateway implements OnGatewayDisconnect {
    private readonly roomsService;
    server: Server;
    constructor(roomsService: RoomsService);
    private readonly memberships;
    handleList(client: Socket): void;
    handleCreate(data: CreateRoomData, client: Socket): {
        roomId: string;
        error?: RoomError;
    };
    handleJoin(data: JoinRoomData, client: Socket): {
        roomId: string;
        playerId: string;
        error?: RoomError;
    };
    handleLeave(data: LeaveRoomData, client: Socket): void;
    handlePlayers(data: {
        roomId: string;
    }, client: Socket): void;
    handleStart(data: StartRoomData, client: Socket): {
        phase: RoomPhase;
        error?: RoomError;
    };
    handleDisconnect(client: Socket): void;
    private broadcastRooms;
    private broadcastPlayers;
}
export {};
