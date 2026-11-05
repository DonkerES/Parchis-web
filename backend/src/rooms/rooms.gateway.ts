import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
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

@WebSocketGateway({ cors: { origin: true } })
export class RoomsGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly roomsService: RoomsService) {}
  private readonly memberships = new Map<string, { roomId: string; playerName: string }>();

  @SubscribeMessage('room:list')
  handleList(@ConnectedSocket() client: Socket): void {
    client.emit('rooms:list', this.roomsService.list());
  }

  @SubscribeMessage('room:create')
  handleCreate(
    @MessageBody() data: CreateRoomData,
    @ConnectedSocket() client: Socket,
  ): { roomId: string; error?: RoomError } {
    const result = this.roomsService.create(data);
    if ('error' in result) return { roomId: '', error: result.error };

    client.join(result.roomId);
    if (data.playerName?.trim()) {
      this.memberships.set(client.id, { roomId: result.roomId, playerName: data.playerName.trim() });
    }
    this.broadcastRooms();
    this.broadcastPlayers(result.roomId);
    return result;
  }

  @SubscribeMessage('room:join')
  handleJoin(
    @MessageBody() data: JoinRoomData,
    @ConnectedSocket() client: Socket,
  ): { roomId: string; playerId: string; error?: RoomError } {
    const result = this.roomsService.join(data.roomId, data.playerName, data.password);
    if ('error' in result) return { roomId: data.roomId, playerId: '', ...result };

    client.join(result.roomId);
    this.memberships.set(client.id, { roomId: result.roomId, playerName: data.playerName.trim() });
    this.broadcastRooms();
    this.broadcastPlayers(result.roomId);
    return result;
  }

  @SubscribeMessage('room:leave')
  handleLeave(
    @MessageBody() data: LeaveRoomData,
    @ConnectedSocket() client: Socket,
  ): void {
    try {
      client.leave(data.roomId);
      const membership = this.memberships.get(client.id);
      const playerName = membership?.playerName ?? data.playerName?.trim();
      this.roomsService.leave(data.roomId, playerName);
      this.memberships.delete(client.id);
      this.broadcastRooms();
      this.broadcastPlayers(data.roomId);
    } catch (error) {
      console.error(`[room:leave] No se pudo procesar la salida de ${data.roomId}`, error);
      client.leave(data.roomId);
      this.memberships.delete(client.id);
      this.broadcastRooms();
      this.broadcastPlayers(data.roomId);
    }
  }

  @SubscribeMessage('room:players')
  handlePlayers(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const state = this.roomsService.getState(data.roomId);
    client.emit('room:players', { roomId: data.roomId, ...(state ?? { players: [], hostName: null, phase: 'waiting' }) });
  }

  @SubscribeMessage('room:start')
  handleStart(
    @MessageBody() data: StartRoomData,
    @ConnectedSocket() client: Socket,
  ): { phase: RoomPhase; error?: RoomError } {
    const result = this.roomsService.start(data.roomId, data.playerName);
    if ('error' in result) return { phase: 'waiting', error: result.error };
    this.broadcastRooms();
    this.broadcastPlayers(data.roomId);
    return { phase: result.phase };
  }

  handleDisconnect(client: Socket): void {
    const membership = this.memberships.get(client.id);
    if (!membership) return;
    this.roomsService.leave(membership.roomId, membership.playerName);
    this.memberships.delete(client.id);
    this.broadcastRooms();
    this.broadcastPlayers(membership.roomId);
  }

  private broadcastRooms(): void {
    this.server.emit('rooms:updated', this.roomsService.list());
  }

  private broadcastPlayers(roomId: string): void {
    const state = this.roomsService.getState(roomId);
    this.server.to(roomId).emit('room:players', {
      roomId,
      ...(state ?? { players: [], hostName: null, phase: 'waiting' }),
    });
  }
}
