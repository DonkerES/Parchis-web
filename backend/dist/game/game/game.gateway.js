"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const rooms_service_1 = require("../../rooms/rooms.service");
const game_service_1 = require("../game.service");
let GameGateway = class GameGateway {
    gameService;
    roomsService;
    server;
    countdownTimers = new Map();
    constructor(gameService, roomsService) {
        this.gameService = gameService;
        this.roomsService = roomsService;
    }
    handleStart(data, client) {
        const roomId = [...client.rooms].find((room) => room !== client.id);
        if (!roomId)
            return;
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
            if (this.roomsService.getPhase(roomId) !== 'countdown')
                return;
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
    handleRoll(data, client) {
        const roomId = [...client.rooms].find((room) => room !== client.id);
        if (!roomId)
            return;
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
        if (result.events)
            result.events.forEach((event) => this.server.to(roomId).emit('game:event', event));
        this.server.to(roomId).emit('game:state', result.state);
    }
    handleMove(data, client) {
        const roomId = [...client.rooms].find((room) => room !== client.id);
        if (!roomId)
            return;
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
    handleSync(client) {
        const roomId = [...client.rooms].find((room) => room !== client.id);
        if (!roomId)
            return;
        const state = this.gameService.getState(roomId);
        if (state)
            client.emit('game:state', state);
    }
    handleGameLeave(data, client) {
        if (!data?.roomId)
            return;
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
                if (timer)
                    clearTimeout(timer);
                this.countdownTimers.delete(data.roomId);
                this.gameService.removeRoom(data.roomId);
            }
            else if (phase === 'countdown' && roomState.players.length < 2) {
                this.roomsService.setPhase(data.roomId, 'waiting');
                this.server.to(data.roomId).emit('room:state', { roomId: data.roomId, phase: 'waiting' });
            }
            this.server.emit('rooms:updated', this.roomsService.list());
            this.broadcastPlayers(data.roomId);
        }
        catch (error) {
            console.error(`[room:leave] Error al retirar al jugador de ${data.roomId}`, error);
        }
        const state = this.gameService.getState(data.roomId);
        if (state)
            this.server.to(data.roomId).emit('game:state', state);
    }
    broadcastPlayers(roomId) {
        const state = this.roomsService.getState(roomId);
        this.server.to(roomId).emit('room:players', {
            roomId,
            ...(state ?? { players: [], hostName: null, phase: 'waiting' }),
        });
    }
};
exports.GameGateway = GameGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], GameGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('game:start'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], GameGateway.prototype, "handleStart", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('game:roll'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], GameGateway.prototype, "handleRoll", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('game:move'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], GameGateway.prototype, "handleMove", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('room:sync'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], GameGateway.prototype, "handleSync", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('room:leave'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], GameGateway.prototype, "handleGameLeave", null);
exports.GameGateway = GameGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({ cors: { origin: true } }),
    __metadata("design:paramtypes", [game_service_1.GameService,
        rooms_service_1.RoomsService])
], GameGateway);
//# sourceMappingURL=game.gateway.js.map