import { Injectable } from '@nestjs/common';

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

interface RoomRecord extends RoomSummary {
  password?: string;
  playerNames: string[];
  hostName: string;
}

export interface RoomError {
  code: 'ROOM_FULL' | 'WRONG_PASSWORD' | 'ROOM_NOT_FOUND' | 'GAME_IN_PROGRESS' | 'INVALID_DATA' | 'NOT_ENOUGH_PLAYERS' | 'NOT_HOST' | 'NOT_YOUR_TURN' | 'INVALID_MOVE' | 'WRONG_PHASE';
  message: string;
}

@Injectable()
export class RoomsService {
  private readonly rooms = new Map<string, RoomRecord>();

  list(): RoomSummary[] {
    return [...this.rooms.values()]
      .filter((room) => room.phase !== 'finished')
      .map(({ password: _password, playerNames: _players, hostName: _host, ...room }) => room);
  }

  getPlayers(roomId: string): string[] {
    return this.rooms.get(roomId)?.playerNames.slice(0, 4) ?? [];
  }

  getState(roomId: string): { players: string[]; hostName: string | null; phase: RoomPhase } | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return { players: room.playerNames.slice(0, 4), hostName: room.hostName || null, phase: room.phase };
  }

  getHostName(roomId: string): string | null {
    return this.rooms.get(roomId)?.hostName ?? null;
  }

  getPlayerCount(roomId: string): number {
    return this.rooms.get(roomId)?.players ?? 0;
  }

  setPhase(roomId: string, phase: RoomPhase): void {
    const room = this.rooms.get(roomId);
    if (room) room.phase = phase;
  }

  getPhase(roomId: string): RoomPhase | null {
    return this.rooms.get(roomId)?.phase ?? null;
  }

  create(data: { name: string; maxPlayers: MaxPlayers; password?: string; playerName?: string }): { roomId: string } | { error: RoomError } {
    const name = data.name?.trim();
    if (!name || name.length < 3 || name.length > 24 || ![2, 3, 4].includes(data.maxPlayers)) {
      return { error: { code: 'INVALID_DATA', message: 'Los datos de la sala no son válidos.' } };
    }
    if (data.password && data.password.length > 24) {
      return { error: { code: 'INVALID_DATA', message: 'La contraseña no puede superar 24 caracteres.' } };
    }

    const roomId = `sala-${Math.random().toString(36).slice(2, 8)}`;
    this.rooms.set(roomId, {
      id: roomId,
      name,
      players: 1,
      maxPlayers: data.maxPlayers,
      hasPassword: Boolean(data.password),
      password: data.password || undefined,
      phase: 'waiting',
      playerNames: data.playerName?.trim() ? [data.playerName.trim()] : [],
      hostName: data.playerName?.trim() ?? '',
    });
    return { roomId };
  }

  join(roomId: string, playerName: string, password?: string): { roomId: string; playerId: string } | { error: RoomError } {
    const room = this.rooms.get(roomId);
    if (!room) return { error: { code: 'ROOM_NOT_FOUND', message: 'La sala no existe.' } };
    if (room.phase === 'playing' || room.phase === 'countdown' || room.phase === 'finished') return { error: { code: 'GAME_IN_PROGRESS', message: 'La partida ya está en juego.' } };
    if (room.players >= room.maxPlayers) return { error: { code: 'ROOM_FULL', message: 'La sala está llena.' } };
    if (room.hasPassword && room.password !== password) {
      return { error: { code: 'WRONG_PASSWORD', message: 'La contraseña es incorrecta.' } };
    }
    if (!playerName?.trim()) return { error: { code: 'INVALID_DATA', message: 'Debes indicar tu nombre.' } };

    room.players += 1;
    room.playerNames.push(playerName.trim());
    return { roomId, playerId: `player-${Math.random().toString(36).slice(2, 8)}` };
  }

  leave(roomId: string, playerName?: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (playerName) {
      const index = room.playerNames.indexOf(playerName);
      if (index < 0) return;
      room.playerNames.splice(index, 1);
    } else {
      room.playerNames.pop();
    }
    room.players = Math.max(0, room.players - 1);
    if (room.players === 0) this.rooms.delete(roomId);
    else {
      if (room.phase === 'countdown' && room.players < 2) room.phase = 'waiting';
      if (room.hostName === playerName || (!room.playerNames.includes(room.hostName) && room.playerNames.length)) {
      room.hostName = room.playerNames[0];
      }
    }
  }

  start(roomId: string, playerName: string): { phase: RoomPhase } | { error: RoomError } {
    const room = this.rooms.get(roomId);
    if (!room) return { error: { code: 'ROOM_NOT_FOUND', message: 'La sala no existe.' } };
    if (room.hostName !== playerName) return { error: { code: 'INVALID_DATA', message: 'Solo el anfitrión puede comenzar la partida.' } };
    if (room.phase === 'playing') return { error: { code: 'INVALID_DATA', message: 'La partida ya comenzó.' } };
    room.phase = 'playing';
    return { phase: room.phase };
  }
}
