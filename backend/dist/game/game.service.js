"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameService = void 0;
exports.playerColors = playerColors;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const game_rules_config_1 = require("./game-rules.config");
const game_engine_1 = require("./game-engine");
function playerColors(count) {
    if (count <= 1)
        return ['red'];
    if (count === 2)
        return ['red', 'yellow'];
    if (count === 3)
        return ['red', 'blue', 'yellow'];
    return ['red', 'blue', 'yellow', 'green'];
}
let GameService = class GameService {
    states = new Map();
    players = new Map();
    countdownTimers = new Map();
    createState(roomId, names) {
        const presentColors = playerColors(names.length);
        const roomPlayers = presentColors.map((color, index) => ({ name: names[index], color, socketId: '' }));
        this.players.set(roomId, roomPlayers);
        const state = (0, game_engine_1.createInitialState)(roomId, presentColors);
        this.states.set(roomId, state);
        return state;
    }
    getState(roomId) {
        return this.states.get(roomId) ?? null;
    }
    removeRoom(roomId) {
        this.states.delete(roomId);
        this.players.delete(roomId);
    }
    getColorForPlayer(roomId, playerName) {
        return this.players.get(roomId)?.find((player) => player.name === playerName)?.color ?? null;
    }
    getPlayerNameForColor(roomId, color) {
        return this.players.get(roomId)?.find((player) => player.color === color)?.name ?? null;
    }
    setSocketPlayer(roomId, playerName, socketId) {
        const player = this.players.get(roomId)?.find((item) => item.name === playerName);
        if (player)
            player.socketId = socketId;
    }
    roll(roomId, playerName) {
        const state = this.states.get(roomId);
        if (!state)
            return { state: null, error: { code: 'WRONG_PHASE', message: 'La partida no ha comenzado.' } };
        const color = this.getColorForPlayer(roomId, playerName);
        if (!color || state.turn.color !== color)
            return { state, error: { code: 'NOT_YOUR_TURN', message: 'No es tu turno.' } };
        if (state.turn.stage !== 'roll')
            return { state, error: { code: 'WRONG_PHASE', message: 'No puedes tirar el dado ahora.' } };
        const value = (0, node_crypto_1.randomInt)(1, 7);
        state.turn.die = value;
        if (state.turn.homeRollsLeft > 0 && state.pieces.filter((piece) => piece.color === color && (piece.progress >= 0 && piece.progress <= 70)).length === 0) {
            if (value !== game_rules_config_1.RULES.exitRoll && state.turn.homeRollsLeft === 1)
                state.turn.homeRollsLeft = 0;
            else if (value !== game_rules_config_1.RULES.exitRoll)
                state.turn.homeRollsLeft -= 1;
        }
        const moves = (0, game_engine_1.legalMoves)(state, color, value, false);
        if (!moves.length) {
            state.turn.legalMoves = [];
            state.turn.stage = 'move';
            const noMoves = [{ type: 'no_moves', color }];
            this.finishTurn(state, color);
            return { state, value, events: [...noMoves, { type: 'turn', color: state.turn.color }] };
        }
        state.turn.legalMoves = moves;
        state.turn.stage = 'move';
        return { state, value };
    }
    move(roomId, playerName, pieceId) {
        const state = this.states.get(roomId);
        if (!state)
            return { state: null, error: { code: 'WRONG_PHASE', message: 'La partida no ha comenzado.' } };
        const color = this.getColorForPlayer(roomId, playerName);
        if (!color || state.turn.color !== color)
            return { state, error: { code: 'NOT_YOUR_TURN', message: 'No es tu turno.' } };
        if (state.turn.stage !== 'move' && state.turn.stage !== 'bonus')
            return { state, error: { code: 'WRONG_PHASE', message: 'No puedes mover ahora.' } };
        const chosen = state.turn.legalMoves.find((move) => move.pieceId === pieceId);
        if (!chosen)
            return { state, error: { code: 'INVALID_MOVE', message: 'Ese movimiento no es válido.' } };
        const events = this.applyMove(state, chosen, color);
        return { state, events };
    }
    applyMove(state, move, color) {
        const piece = state.pieces.find((item) => item.id === move.pieceId);
        if (!piece)
            return [];
        const events = [];
        const from = piece.progress;
        if (move.kind === 'exit') {
            piece.progress = 0;
            events.push({ type: 'exit', pieceId: piece.id });
            if (game_rules_config_1.RULES.exitCapturesOnStart) {
                const startSquare = game_rules_config_1.START[color];
                const captured = state.pieces.filter((other) => other.color !== color && other.progress >= 0 && other.progress <= 63 &&
                    (0, game_engine_1.trackSquare)(other.color, other.progress) === startSquare);
                if (captured.length) {
                    captured.forEach((other) => { other.progress = -1; });
                    events.push({ type: 'capture', pieceId: piece.id, capturedPieceIds: captured.map((other) => other.id) });
                    events.push({ type: 'bonus', color, amount: game_rules_config_1.RULES.captureBonus });
                    this.setBonus(state, color, game_rules_config_1.RULES.captureBonus, events);
                    return events;
                }
            }
        }
        else {
            piece.progress = move.toProgress;
            events.push({ type: 'move', pieceId: piece.id, from, to: piece.progress });
            if (move.capturesPieceIds.length) {
                for (const id of move.capturesPieceIds) {
                    const captured = state.pieces.find((item) => item.id === id);
                    if (captured)
                        captured.progress = -1;
                }
                events.push({ type: 'capture', pieceId: piece.id, capturedPieceIds: move.capturesPieceIds });
                events.push({ type: 'bonus', color, amount: game_rules_config_1.RULES.captureBonus });
                this.setBonus(state, color, game_rules_config_1.RULES.captureBonus, events);
                return events;
            }
        }
        if (piece.progress === 71) {
            events.push({ type: 'goal', pieceId: piece.id });
            if (state.pieces.filter((item) => item.color === color).every((item) => item.progress === 71)) {
                state.winner = color;
                return events;
            }
            events.push({ type: 'bonus', color, amount: game_rules_config_1.RULES.goalBonus });
            this.setBonus(state, color, game_rules_config_1.RULES.goalBonus, events);
            return events;
        }
        if (state.turn.stage === 'bonus') {
            state.turn.bonus = null;
            const bonusMoves = (0, game_engine_1.legalMoves)(state, color, state.turn.die ?? 0, true);
            void bonusMoves;
            this.finishTurn(state, color);
            return events;
        }
        if (state.turn.die === 6) {
            state.turn.sixesInRow += 1;
            if (state.turn.sixesInRow >= 3 && game_rules_config_1.RULES.threeSixesPenalty) {
                piece.progress = piece.progress >= 64 || piece.progress === 71 ? piece.progress : -1;
                if (piece.progress === -1)
                    events.push({ type: 'penalty', color, pieceId: piece.id });
                else
                    events.push({ type: 'penalty', color, pieceId: null });
                this.finishTurn(state, color);
            }
            else {
                state.turn.stage = 'roll';
                state.turn.die = null;
                state.turn.legalMoves = [];
            }
        }
        else {
            this.finishTurn(state, color);
        }
        return events;
    }
    setBonus(state, color, amount, events) {
        const moves = (0, game_engine_1.legalMoves)(state, color, amount, true);
        state.turn.stage = moves.length ? 'bonus' : 'move';
        state.turn.bonus = moves.length ? amount : null;
        if (!moves.length) {
            events.push({ type: 'bonus_lost', color });
            this.finishTurn(state, color);
        }
        else {
            state.turn.legalMoves = moves;
        }
    }
    finishTurn(state, _color) {
        const present = game_rules_config_1.COLOR_ORDER.filter((color) => state.pieces.some((piece) => piece.color === color));
        state.turn = {
            color: (0, game_engine_1.nextColor)(state.turn.color, present),
            stage: 'roll',
            die: null,
            bonus: null,
            sixesInRow: 0,
            homeRollsLeft: game_rules_config_1.RULES.homeAttempts,
            legalMoves: [],
        };
    }
    removePlayer(roomId, playerName) {
        const state = this.states.get(roomId);
        if (!state)
            return { gameOver: false, winner: null };
        const color = this.getColorForPlayer(roomId, playerName);
        if (!color)
            return { gameOver: false, winner: null };
        state.pieces = state.pieces.filter((piece) => piece.color !== color);
        const remaining = game_rules_config_1.COLOR_ORDER.filter((item) => state.pieces.some((piece) => piece.color === item));
        if (remaining.length === 1) {
            state.winner = remaining[0];
            return { gameOver: true, winner: remaining[0] };
        }
        if (state.turn.color === color)
            this.finishTurn(state, color);
        return { gameOver: false, winner: null };
    }
};
exports.GameService = GameService;
exports.GameService = GameService = __decorate([
    (0, common_1.Injectable)()
], GameService);
//# sourceMappingURL=game.service.js.map