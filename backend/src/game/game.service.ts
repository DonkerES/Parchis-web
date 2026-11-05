import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { COLOR_ORDER, RULES, SAFE, START, type Color } from './game-rules.config';
import { createInitialState, legalMoves, nextColor, trackSquare } from './game-engine';
import type { GameEvent, GameState, LegalMove } from './game-engine.types';

interface RoomPlayer { name: string; color: Color; socketId: string; }

export function playerColors(count: number): Color[] {
  if (count <= 1) return ['red'];
  if (count === 2) return ['red', 'yellow'];
  if (count === 3) return ['red', 'blue', 'yellow'];
  return ['red', 'blue', 'yellow', 'green'];
}

@Injectable()
export class GameService {
  private readonly states = new Map<string, GameState>();
  private readonly players = new Map<string, RoomPlayer[]>();
  private readonly countdownTimers = new Map<string, NodeJS.Timeout>();

  createState(roomId: string, names: string[]): GameState {
    const presentColors = playerColors(names.length);
    const roomPlayers = presentColors.map((color, index) => ({ name: names[index], color, socketId: '' }));
    this.players.set(roomId, roomPlayers);
    const state = createInitialState(roomId, presentColors);
    this.states.set(roomId, state);
    return state;
  }

  getState(roomId: string): GameState | null {
    return this.states.get(roomId) ?? null;
  }

  removeRoom(roomId: string): void {
    this.states.delete(roomId);
    this.players.delete(roomId);
  }

  getColorForPlayer(roomId: string, playerName: string): Color | null {
    return this.players.get(roomId)?.find((player) => player.name === playerName)?.color ?? null;
  }

  getPlayerNameForColor(roomId: string, color: Color): string | null {
    return this.players.get(roomId)?.find((player) => player.color === color)?.name ?? null;
  }

  setSocketPlayer(roomId: string, playerName: string, socketId: string): void {
    const player = this.players.get(roomId)?.find((item) => item.name === playerName);
    if (player) player.socketId = socketId;
  }

  roll(roomId: string, playerName: string): { state: GameState; value?: number; error?: { code: string; message: string }; events?: GameEvent[] } {
    const state = this.states.get(roomId);
    if (!state) return { state: null as unknown as GameState, error: { code: 'WRONG_PHASE', message: 'La partida no ha comenzado.' } };
    const color = this.getColorForPlayer(roomId, playerName);
    if (!color || state.turn.color !== color) return { state, error: { code: 'NOT_YOUR_TURN', message: 'No es tu turno.' } };
    if (state.turn.stage !== 'roll') return { state, error: { code: 'WRONG_PHASE', message: 'No puedes tirar el dado ahora.' } };

    const value = randomInt(1, 7);
    state.turn.die = value;
    if (state.turn.homeRollsLeft > 0 && state.pieces.filter((piece) => piece.color === color && (piece.progress >= 0 && piece.progress <= 70)).length === 0) {
      if (value !== RULES.exitRoll && state.turn.homeRollsLeft === 1) state.turn.homeRollsLeft = 0;
      else if (value !== RULES.exitRoll) state.turn.homeRollsLeft -= 1;
    }

    const moves = legalMoves(state, color, value, false);
    if (!moves.length) {
      state.turn.legalMoves = [];
      state.turn.stage = 'move';
      const noMoves: GameEvent[] = [{ type: 'no_moves', color }];
      this.finishTurn(state, color);
      return { state, value, events: [...noMoves, { type: 'turn', color: state.turn.color }] };
    }
    state.turn.legalMoves = moves;
    state.turn.stage = 'move';
    return { state, value };
  }

  move(roomId: string, playerName: string, pieceId: string): { state: GameState; error?: { code: string; message: string }; events?: GameEvent[] } {
    const state = this.states.get(roomId);
    if (!state) return { state: null as unknown as GameState, error: { code: 'WRONG_PHASE', message: 'La partida no ha comenzado.' } };
    const color = this.getColorForPlayer(roomId, playerName);
    if (!color || state.turn.color !== color) return { state, error: { code: 'NOT_YOUR_TURN', message: 'No es tu turno.' } };
    if (state.turn.stage !== 'move' && state.turn.stage !== 'bonus') return { state, error: { code: 'WRONG_PHASE', message: 'No puedes mover ahora.' } };
    const chosen = state.turn.legalMoves.find((move) => move.pieceId === pieceId);
    if (!chosen) return { state, error: { code: 'INVALID_MOVE', message: 'Ese movimiento no es válido.' } };

    const events = this.applyMove(state, chosen, color);
    return { state, events };
  }

  private applyMove(state: GameState, move: LegalMove, color: Color): GameEvent[] {
    const piece = state.pieces.find((item) => item.id === move.pieceId);
    if (!piece) return [];
    const events: GameEvent[] = [];
    const from = piece.progress;

    if (move.kind === 'exit') {
      piece.progress = 0;
      events.push({ type: 'exit', pieceId: piece.id });
      if (RULES.exitCapturesOnStart) {
        const startSquare = START[color];
        const captured = state.pieces.filter((other) => other.color !== color && other.progress >= 0 && other.progress <= 63 &&
          trackSquare(other.color, other.progress) === startSquare);
        if (captured.length) {
          captured.forEach((other) => { other.progress = -1; });
          events.push({ type: 'capture', pieceId: piece.id, capturedPieceIds: captured.map((other) => other.id) });
          events.push({ type: 'bonus', color, amount: RULES.captureBonus });
          this.setBonus(state, color, RULES.captureBonus, events);
          return events;
        }
      }
    } else {
      piece.progress = move.toProgress;
      events.push({ type: 'move', pieceId: piece.id, from, to: piece.progress });
      if (move.capturesPieceIds.length) {
        for (const id of move.capturesPieceIds) {
          const captured = state.pieces.find((item) => item.id === id);
          if (captured) captured.progress = -1;
        }
        events.push({ type: 'capture', pieceId: piece.id, capturedPieceIds: move.capturesPieceIds });
        events.push({ type: 'bonus', color, amount: RULES.captureBonus });
        this.setBonus(state, color, RULES.captureBonus, events);
        return events;
      }
    }

    if (piece.progress === 71) {
      events.push({ type: 'goal', pieceId: piece.id });
      if (state.pieces.filter((item) => item.color === color).every((item) => item.progress === 71)) {
        state.winner = color;
        return events;
      }
      events.push({ type: 'bonus', color, amount: RULES.goalBonus });
      this.setBonus(state, color, RULES.goalBonus, events);
      return events;
    }

    if (state.turn.stage === 'bonus') {
      state.turn.bonus = null;
      const bonusMoves = legalMoves(state, color, state.turn.die ?? 0, true);
      void bonusMoves;
      this.finishTurn(state, color);
      return events;
    }

    if (state.turn.die === 6) {
      state.turn.sixesInRow += 1;
      if (state.turn.sixesInRow >= 3 && RULES.threeSixesPenalty) {
        piece.progress = piece.progress >= 64 || piece.progress === 71 ? piece.progress : -1;
        if (piece.progress === -1) events.push({ type: 'penalty', color, pieceId: piece.id });
        else events.push({ type: 'penalty', color, pieceId: null });
        this.finishTurn(state, color);
      } else {
        state.turn.stage = 'roll';
        state.turn.die = null;
        state.turn.legalMoves = [];
      }
    } else {
      this.finishTurn(state, color);
    }
    return events;
  }

  private setBonus(state: GameState, color: Color, amount: 10 | 20, events: GameEvent[]): void {
    const moves = legalMoves(state, color, amount, true);
    state.turn.stage = moves.length ? 'bonus' : 'move';
    state.turn.bonus = moves.length ? amount : null;
    if (!moves.length) {
      events.push({ type: 'bonus_lost', color });
      this.finishTurn(state, color);
    } else {
      state.turn.legalMoves = moves;
    }
  }

  private finishTurn(state: GameState, _color: Color): void {
    const present = COLOR_ORDER.filter((color) => state.pieces.some((piece) => piece.color === color));
    state.turn = {
      color: nextColor(state.turn.color, present),
      stage: 'roll',
      die: null,
      bonus: null,
      sixesInRow: 0,
      homeRollsLeft: RULES.homeAttempts,
      legalMoves: [],
    };
  }

  removePlayer(roomId: string, playerName: string): { gameOver: boolean; winner: Color | null } {
    const state = this.states.get(roomId);
    if (!state) return { gameOver: false, winner: null };
    const color = this.getColorForPlayer(roomId, playerName);
    if (!color) return { gameOver: false, winner: null };
    state.pieces = state.pieces.filter((piece) => piece.color !== color);
    const remaining = COLOR_ORDER.filter((item) => state.pieces.some((piece) => piece.color === item));
    if (remaining.length === 1) {
      state.winner = remaining[0];
      return { gameOver: true, winner: remaining[0] };
    }
    if (state.turn.color === color) this.finishTurn(state, color);
    return { gameOver: false, winner: null };
  }
}
