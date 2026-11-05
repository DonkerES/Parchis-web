import { COLOR_ORDER, LANE_LEN, RULES, SAFE, START, TRACK_LEN, type Color } from './game-rules.config';
import type { GameEvent, GameState, LegalMove, PieceState } from './game-engine.types';

export function trackSquare(color: Color, progress: number): number {
  return ((START[color] - 1 + progress) % TRACK_LEN) + 1;
}

export function createInitialState(roomId: string, presentColors: Color[]): GameState {
  const pieces: PieceState[] = [];
  for (const color of presentColors) {
    for (let index = 0; index < 4; index++) pieces.push({ id: `${color}-${index}`, color, progress: -1 });
  }
  const first = presentColors[Math.floor(Math.random() * presentColors.length)] ?? 'red';
  return {
    roomId,
    pieces,
    turn: { color: first, stage: 'roll', die: null, bonus: null, sixesInRow: 0, homeRollsLeft: RULES.homeAttempts, legalMoves: [] },
    winner: null,
  };
}

function piecesAtTrack(state: GameState, color: Color, progressSquare: number): PieceState[] {
  return state.pieces.filter((piece) => piece.progress >= 0 && piece.progress <= 63 &&
    trackSquare(piece.color, piece.progress) === progressSquare);
}

export function barrierAt(state: GameState, square: number): boolean {
  const sameColor = COLOR_ORDER.map((color) => state.pieces.filter((piece) =>
    piece.color === color && piece.progress >= 0 && piece.progress <= 63 &&
    trackSquare(piece.color, piece.progress) === square,
  ).length).some((count) => count >= 2);
  return sameColor;
}

function ownBarrier(state: GameState, piece: PieceState): boolean {
  if (piece.progress < 0 || piece.progress > 63) return false;
  const square = trackSquare(piece.color, piece.progress);
  return state.pieces.filter((item) => item.color === piece.color && item.progress >= 0 && item.progress <= 63 &&
    trackSquare(item.color, item.progress) === square).length >= 2;
}

export function legalMoves(state: GameState, color: Color, steps: number, isBonus = false): LegalMove[] {
  const moves: LegalMove[] = [];
  const colorPieces = state.pieces.filter((piece) => piece.color === color && piece.progress !== 71);

  for (const piece of colorPieces) {
    if (piece.progress === -1) {
      if (!isBonus && steps === RULES.exitRoll && !barrierAt(state, START[color])) {
        moves.push({ pieceId: piece.id, kind: 'exit', steps, toProgress: 0, capturesPieceIds: [] });
      }
      continue;
    }
    const target = piece.progress + steps;
    if (target > 71) continue;
    let blocked = false;
    for (let progress = piece.progress + 1; progress <= Math.min(target, 63); progress++) {
      const square = trackSquare(color, progress);
      if (barrierAt(state, square)) { blocked = true; break; }
    }
    if (blocked) continue;

    const capturesPieceIds: string[] = [];
    if (target <= 63) {
      const square = trackSquare(color, target);
      const occupants = piecesAtTrack(state, color, square);
      if (occupants.length >= 2) continue;
      if (!SAFE.has(square)) {
        for (const rival of occupants) if (rival.color !== color) capturesPieceIds.push(rival.id);
      }
    }
    moves.push({ pieceId: piece.id, kind: isBonus ? 'bonus' : 'move', steps, toProgress: target, capturesPieceIds });
  }

  const exits = moves.filter((move) => move.kind === 'exit');
  if (!isBonus && steps === RULES.exitRoll && exits.length) return [exits[0]];
  if (!isBonus && steps === 6 && RULES.mustBreakBarrierOnSix) {
    const fromBarrier = moves.filter((move) => {
      const piece = state.pieces.find((item) => item.id === move.pieceId);
      return piece && ownBarrier(state, piece);
    });
    if (fromBarrier.length) return fromBarrier;
  }
  return moves;
}

export function nextColor(current: Color, presentColors: Color[]): Color {
  const currentIndex = COLOR_ORDER.indexOf(current);
  for (let offset = 1; offset <= COLOR_ORDER.length; offset++) {
    const candidate = COLOR_ORDER[(currentIndex + offset) % COLOR_ORDER.length];
    if (presentColors.includes(candidate)) return candidate;
  }
  return current;
}
