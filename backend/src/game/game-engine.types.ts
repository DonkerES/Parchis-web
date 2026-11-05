import type { Color } from './game-rules.config';

export interface PieceState {
  id: string;
  color: Color;
  progress: number;
}

export interface LegalMove {
  pieceId: string;
  kind: 'exit' | 'move' | 'bonus';
  steps: number;
  toProgress: number;
  capturesPieceIds: string[];
}

export interface TurnState {
  color: Color;
  stage: 'roll' | 'move' | 'bonus';
  die: number | null;
  bonus: 10 | 20 | null;
  sixesInRow: number;
  homeRollsLeft: number;
  legalMoves: LegalMove[];
}

export interface GameState {
  roomId: string;
  pieces: PieceState[];
  turn: TurnState;
  winner: Color | null;
}

export type GameEvent =
  | { type: 'exit'; pieceId: string }
  | { type: 'move'; pieceId: string; from: number; to: number }
  | { type: 'capture'; pieceId: string; capturedPieceIds: string[] }
  | { type: 'bonus'; color: Color; amount: 10 | 20 }
  | { type: 'bonus_lost'; color: Color }
  | { type: 'goal'; pieceId: string }
  | { type: 'penalty'; color: Color; pieceId: string | null }
  | { type: 'no_moves'; color: Color }
  | { type: 'turn'; color: Color };
