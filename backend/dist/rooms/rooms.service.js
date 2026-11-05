"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomsService = void 0;
const common_1 = require("@nestjs/common");
let RoomsService = class RoomsService {
    rooms = new Map();
    list() {
        return [...this.rooms.values()]
            .filter((room) => room.phase !== 'finished')
            .map(({ password: _password, playerNames: _players, hostName: _host, ...room }) => room);
    }
    getPlayers(roomId) {
        return this.rooms.get(roomId)?.playerNames.slice(0, 4) ?? [];
    }
    getState(roomId) {
        const room = this.rooms.get(roomId);
        if (!room)
            return null;
        return { players: room.playerNames.slice(0, 4), hostName: room.hostName || null, phase: room.phase };
    }
    getHostName(roomId) {
        return this.rooms.get(roomId)?.hostName ?? null;
    }
    getPlayerCount(roomId) {
        return this.rooms.get(roomId)?.players ?? 0;
    }
    setPhase(roomId, phase) {
        const room = this.rooms.get(roomId);
        if (room)
            room.phase = phase;
    }
    getPhase(roomId) {
        return this.rooms.get(roomId)?.phase ?? null;
    }
    create(data) {
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
    join(roomId, playerName, password) {
        const room = this.rooms.get(roomId);
        if (!room)
            return { error: { code: 'ROOM_NOT_FOUND', message: 'La sala no existe.' } };
        if (room.phase === 'playing' || room.phase === 'countdown' || room.phase === 'finished')
            return { error: { code: 'GAME_IN_PROGRESS', message: 'La partida ya está en juego.' } };
        if (room.players >= room.maxPlayers)
            return { error: { code: 'ROOM_FULL', message: 'La sala está llena.' } };
        if (room.hasPassword && room.password !== password) {
            return { error: { code: 'WRONG_PASSWORD', message: 'La contraseña es incorrecta.' } };
        }
        if (!playerName?.trim())
            return { error: { code: 'INVALID_DATA', message: 'Debes indicar tu nombre.' } };
        room.players += 1;
        room.playerNames.push(playerName.trim());
        return { roomId, playerId: `player-${Math.random().toString(36).slice(2, 8)}` };
    }
    leave(roomId, playerName) {
        const room = this.rooms.get(roomId);
        if (!room)
            return;
        if (playerName) {
            const index = room.playerNames.indexOf(playerName);
            if (index < 0)
                return;
            room.playerNames.splice(index, 1);
        }
        else {
            room.playerNames.pop();
        }
        room.players = Math.max(0, room.players - 1);
        if (room.players === 0)
            this.rooms.delete(roomId);
        else {
            if (room.phase === 'countdown' && room.players < 2)
                room.phase = 'waiting';
            if (room.hostName === playerName || (!room.playerNames.includes(room.hostName) && room.playerNames.length)) {
                room.hostName = room.playerNames[0];
            }
        }
    }
    start(roomId, playerName) {
        const room = this.rooms.get(roomId);
        if (!room)
            return { error: { code: 'ROOM_NOT_FOUND', message: 'La sala no existe.' } };
        if (room.hostName !== playerName)
            return { error: { code: 'INVALID_DATA', message: 'Solo el anfitrión puede comenzar la partida.' } };
        if (room.phase === 'playing')
            return { error: { code: 'INVALID_DATA', message: 'La partida ya comenzó.' } };
        room.phase = 'playing';
        return { phase: room.phase };
    }
};
exports.RoomsService = RoomsService;
exports.RoomsService = RoomsService = __decorate([
    (0, common_1.Injectable)()
], RoomsService);
//# sourceMappingURL=rooms.service.js.map