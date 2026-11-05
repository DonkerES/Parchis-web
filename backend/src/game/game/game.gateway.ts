import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RoomsService } from '../../rooms/rooms.service';
import { GameService } from '../game.service';
import { COLOR_ORDER, type Color } from '../game-rules.config';

@WebSocketGateway({ cors: { origin: true } })
export class GameGateway {
  @WebSocketServer()
  server: Server;

  private readonly countdownTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly gameService: GameService,
    private readonly roomsService: RoomsService,
  ) {}

  @SubscribeMessage('game:start')
  handleStart(
    @MessageBody() data: { playerName: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const roomId = [...client.rooms].find((room) => room !== client.id);
    if (!roomId) return;
    console.log(`[game:roll] room=${roomId} player=${data?.playerName}`);
    const names = this.roomsService.getState(roomId)?.players ?? [];
    if (this.roomsService.getHostName(roomId) !== data.playerName) {
      client.emit('error:message', { code: 'NOT_HOST', message: 'Solo el anfitrión puede iniciar la partida.' });
      return;
    }
    if (names.length < 2) {
      client.emit('error:message', { code: 'NOT_ENOUGH_PLAYERS', message: 'Se necesitan al menos 2 jugadores.' });
      return;
    }
    if (this.roomsService.getPhase(roomId) !== 'waiting') {
      client.emit('error:message', { code: 'WRONG_PHASE', message: 'La partida no está en espera.' });
      return;
    }

    this.roomsService.setPhase(roomId, 'countdown');
    const serverNow = Date.now();
    const startsAt = serverNow + 5000;
    this.server.to(roomId).emit('game:countdown', { startsAt, serverNow, seconds: 5 });
    this.server.to(roomId).emit('room:state', { roomId, phase: 'countdown' });
    this.broadcastPlayers(roomId);
    this.server.emit('rooms:updated', this.roomsService.list());

    const timer = setTimeout(() => {
      if (this.roomsService.getPhase(roomId) !== 'countdown') return;
      const presentNames = this.roomsService.getState(roomId)?.players ?? [];
      if (presentNames.length < 2) {
        this.roomsService.setPhase(roomId, 'waiting');
        this.server.emit('rooms:updated', this.roomsService.list());
        return;
      }
      this.roomsService.setPhase(roomId, 'playing');
      const state = this.gameService.createState(roomId, presentNames);
      presentNames.forEach((name, index) => {
        this.gameService.setSocketPlayer(roomId, name, '');
      });
      this.server.to(roomId).emit('room:state', { roomId, phase: 'playing' });
      this.broadcastPlayers(roomId);
      this.server.to(roomId).emit('game:state', state);
      this.server.emit('rooms:updated', this.roomsService.list());
      this.countdownTimers.delete(roomId);
    }, 5000);
    this.countdownTimers.set(roomId, timer);
  }

  @SubscribeMessage('game:roll')
  handleRoll(
    @MessageBody() data: { playerName: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const roomId = [...client.rooms].find((room) => room !== client.id);
    if (!roomId) return;
    if (this.roomsService.getPhase(roomId) !== 'playing') {
      client.emit('error:message', { code: 'WRONG_PHASE', message: 'La partida todavía no está en juego.' });
      return;
    }
    const result = this.gameService.roll(roomId, data.playerName);
    if (result.error) {
      client.emit('error:message', result.error);
      return;
    }
    client.to(roomId).emit('game:rolled', { color: result.state.turn.color, value: result.value });
    client.emit('game:rolled', { color: result.state.turn.color, value: result.value });
    if (result.events) result.events.forEach((event) => this.server.to(roomId).emit('game:event', event));
    this.server.to(roomId).emit('game:state', result.state);
  }

  @SubscribeMessage('game:move')
  handleMove(
    @MessageBody() data: { pieceId: string; playerName: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const roomId = [...client.rooms].find((room) => room !== client.id);
    if (!roomId) return;
    const result = this.gameService.move(roomId, data.playerName, data.pieceId);
    if (result.error) {
      client.emit('error:message', result.error);
      return;
    }
    result.events?.forEach((event) => this.server.to(roomId).emit('game:event', event));
    this.server.to(roomId).emit('game:state', result.state);
    if (result.state.winner) {
      const name = this.gameService.getPlayerNameForColor(roomId, result.state.winner) ?? 'Jugador';
      this.roomsService.setPhase(roomId, 'finished');
      this.server.to(roomId).emit('room:state', { roomId, phase: 'finished' });
      this.server.to(roomId).emit('game:over', {
        winner: { playerId: result.state.winner, name, color: result.state.winner },
        reason: 'completed',
      });
      this.server.emit('rooms:updated', this.roomsService.list());
    }
  }

  @SubscribeMessage('room:sync')
  handleSync(@ConnectedSocket() client: Socket): void {
    const roomId = [...client.rooms].find((room) => room !== client.id);
    if (!roomId) return;
    const state = this.gameService.getState(roomId);
    if (state) client.emit('game:state', state);
  }

  @SubscribeMessage('room:leave')
  handleGameLeave(
    @MessageBody() data: { roomId: string; playerName?: string },
    @ConnectedSocket() client: Socket,
  ): void {
    if (!data?.roomId) return;
    try {
      const roomStateBeforeLeave = this.roomsService.getState(data.roomId);
      const phase = roomStateBeforeLeave?.phase ?? null;
      if (phase === 'countdown') {
        const timer = this.countdownTimers.get(data.roomId);
        if (timer) {
          clearTimeout(timer);
          this.countdownTimers.delete(data.roomId);
        }
      }

      if (phase === 'playing' && data.playerName) {
        const result = this.gameService.removePlayer(data.roomId, data.playerName);
        const remaining = this.gameService.getState(data.roomId);
        if (remaining) {
          this.server.to(data.roomId).emit('game:state', remaining);
          this.broadcastPlayers(data.roomId);
        }
        if (result.gameOver && result.winner) {
          const winnerName = this.gameService.getPlayerNameForColor(data.roomId, result.winner) ?? 'Jugador';
          this.roomsService.setPhase(data.roomId, 'finished');
          this.server.to(data.roomId).emit('room:state', { roomId: data.roomId, phase: 'finished' });
          this.server.to(data.roomId).emit('game:over', {
            winner: { playerId: result.winner, name: winnerName, color: result.winner },
            reason: 'abandonment',
          });
        }
      }

      const roomState = this.roomsService.getState(data.roomId);
      if (!roomState || roomState.players.length === 0 || roomState.players.length === 1) {
        const timer = this.countdownTimers.get(data.roomId);
        if (timer) clearTimeout(timer);
        this.countdownTimers.delete(data.roomId);
        this.gameService.removeRoom(data.roomId);
      } else if (phase === 'countdown' && roomState.players.length < 2) {
        this.roomsService.setPhase(data.roomId, 'waiting');
        this.server.to(data.roomId).emit('room:state', { roomId: data.roomId, phase: 'waiting' });
      }

      this.server.emit('rooms:updated', this.roomsService.list());
      this.broadcastPlayers(data.roomId);
    } catch (error) {
      console.error(`[room:leave] Error al retirar al jugador de ${data.roomId}`, error);
    }
    const state = this.gameService.getState(data.roomId);
    if (state) this.server.to(data.roomId).emit('game:state', state);
  }

  private broadcastPlayers(roomId: string): void {
    const state = this.roomsService.getState(roomId);
    this.server.to(roomId).emit('room:players', {
      roomId,
      ...(state ?? { players: [], hostName: null, phase: 'waiting' }),
    });
  }
}
