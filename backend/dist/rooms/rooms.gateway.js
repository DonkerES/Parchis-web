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
exports.RoomsGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const rooms_service_1 = require("./rooms.service");
let RoomsGateway = class RoomsGateway {
    roomsService;
    server;
    constructor(roomsService) {
        this.roomsService = roomsService;
    }
    memberships = new Map();
    handleList(client) {
        client.emit('rooms:list', this.roomsService.list());
    }
    handleCreate(data, client) {
        const result = this.roomsService.create(data);
        if ('error' in result)
            return { roomId: '', error: result.error };
        client.join(result.roomId);
        if (data.playerName?.trim()) {
            this.memberships.set(client.id, { roomId: result.roomId, playerName: data.playerName.trim() });
        }
        this.broadcastRooms();
        this.broadcastPlayers(result.roomId);
        return result;
    }
    handleJoin(data, client) {
        const result = this.roomsService.join(data.roomId, data.playerName, data.password);
        if ('error' in result)
            return { roomId: data.roomId, playerId: '', ...result };
        client.join(result.roomId);
        this.memberships.set(client.id, { roomId: result.roomId, playerName: data.playerName.trim() });
        this.broadcastRooms();
        this.broadcastPlayers(result.roomId);
        return result;
    }
    handleLeave(data, client) {
        try {
            client.leave(data.roomId);
            const membership = this.memberships.get(client.id);
            const playerName = membership?.playerName ?? data.playerName?.trim();
            this.roomsService.leave(data.roomId, playerName);
            this.memberships.delete(client.id);
            this.broadcastRooms();
            this.broadcastPlayers(data.roomId);
        }
        catch (error) {
            console.error(`[room:leave] No se pudo procesar la salida de ${data.roomId}`, error);
            client.leave(data.roomId);
            this.memberships.delete(client.id);
            this.broadcastRooms();
            this.broadcastPlayers(data.roomId);
        }
    }
    handlePlayers(data, client) {
        const state = this.roomsService.getState(data.roomId);
        client.emit('room:players', { roomId: data.roomId, ...(state ?? { players: [], hostName: null, phase: 'waiting' }) });
    }
    handleStart(data, client) {
        const result = this.roomsService.start(data.roomId, data.playerName);
        if ('error' in result)
            return { phase: 'waiting', error: result.error };
        this.broadcastRooms();
        this.broadcastPlayers(data.roomId);
        return { phase: result.phase };
    }
    handleDisconnect(client) {
        const membership = this.memberships.get(client.id);
        if (!membership)
            return;
        this.roomsService.leave(membership.roomId, membership.playerName);
        this.memberships.delete(client.id);
        this.broadcastRooms();
        this.broadcastPlayers(membership.roomId);
    }
    broadcastRooms() {
        this.server.emit('rooms:updated', this.roomsService.list());
    }
    broadcastPlayers(roomId) {
        const state = this.roomsService.getState(roomId);
        this.server.to(roomId).emit('room:players', {
            roomId,
            ...(state ?? { players: [], hostName: null, phase: 'waiting' }),
        });
    }
};
exports.RoomsGateway = RoomsGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], RoomsGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('room:list'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], RoomsGateway.prototype, "handleList", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('room:create'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Object)
], RoomsGateway.prototype, "handleCreate", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('room:join'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Object)
], RoomsGateway.prototype, "handleJoin", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('room:leave'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], RoomsGateway.prototype, "handleLeave", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('room:players'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], RoomsGateway.prototype, "handlePlayers", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('room:start'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Object)
], RoomsGateway.prototype, "handleStart", null);
exports.RoomsGateway = RoomsGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({ cors: { origin: true } }),
    __metadata("design:paramtypes", [rooms_service_1.RoomsService])
], RoomsGateway);
//# sourceMappingURL=rooms.gateway.js.map