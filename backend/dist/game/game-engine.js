"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackSquare = trackSquare;
exports.createInitialState = createInitialState;
exports.barrierAt = barrierAt;
exports.legalMoves = legalMoves;
exports.nextColor = nextColor;
const game_rules_config_1 = require("./game-rules.config");
function trackSquare(color, progress) {
    return ((game_rules_config_1.START[color] - 1 + progress) % game_rules_config_1.TRACK_LEN) + 1;
}
function createInitialState(roomId, presentColors) {
    const pieces = [];
    for (const color of presentColors) {
        for (let index = 0; index < 4; index++)
            pieces.push({ id: `${color}-${index}`, color, progress: -1 });
    }
    const first = presentColors[Math.floor(Math.random() * presentColors.length)] ?? 'red';
    return {
        roomId,
        pieces,
        turn: { color: first, stage: 'roll', die: null, bonus: null, sixesInRow: 0, homeRollsLeft: game_rules_config_1.RULES.homeAttempts, legalMoves: [] },
        winner: null,
    };
}
function piecesAtTrack(state, color, progressSquare) {
    return state.pieces.filter((piece) => piece.progress >= 0 && piece.progress <= 63 &&
        trackSquare(piece.color, piece.progress) === progressSquare);
}
function barrierAt(state, square) {
    const sameColor = game_rules_config_1.COLOR_ORDER.map((color) => state.pieces.filter((piece) => piece.color === color && piece.progress >= 0 && piece.progress <= 63 &&
        trackSquare(piece.color, piece.progress) === square).length).some((count) => count >= 2);
    return sameColor;
}
function ownBarrier(state, piece) {
    if (piece.progress < 0 || piece.progress > 63)
        return false;
    const square = trackSquare(piece.color, piece.progress);
    return state.pieces.filter((item) => item.color === piece.color && item.progress >= 0 && item.progress <= 63 &&
        trackSquare(item.color, item.progress) === square).length >= 2;
}
function legalMoves(state, color, steps, isBonus = false) {
    const moves = [];
    const colorPieces = state.pieces.filter((piece) => piece.color === color && piece.progress !== 71);
    for (const piece of colorPieces) {
        if (piece.progress === -1) {
            if (!isBonus && steps === game_rules_config_1.RULES.exitRoll && !barrierAt(state, game_rules_config_1.START[color])) {
                moves.push({ pieceId: piece.id, kind: 'exit', steps, toProgress: 0, capturesPieceIds: [] });
            }
            continue;
        }
        const target = piece.progress + steps;
        if (target > 71)
            continue;
        let blocked = false;
        for (let progress = piece.progress + 1; progress <= Math.min(target, 63); progress++) {
            const square = trackSquare(color, progress);
            if (barrierAt(state, square)) {
                blocked = true;
                break;
            }
        }
        if (blocked)
            continue;
        const capturesPieceIds = [];
        if (target <= 63) {
            const square = trackSquare(color, target);
            const occupants = piecesAtTrack(state, color, square);
            if (occupants.length >= 2)
                continue;
            if (!game_rules_config_1.SAFE.has(square)) {
                for (const rival of occupants)
                    if (rival.color !== color)
                        capturesPieceIds.push(rival.id);
            }
        }
        moves.push({ pieceId: piece.id, kind: isBonus ? 'bonus' : 'move', steps, toProgress: target, capturesPieceIds });
    }
    const exits = moves.filter((move) => move.kind === 'exit');
    if (!isBonus && steps === game_rules_config_1.RULES.exitRoll && exits.length)
        return [exits[0]];
    if (!isBonus && steps === 6 && game_rules_config_1.RULES.mustBreakBarrierOnSix) {
        const fromBarrier = moves.filter((move) => {
            const piece = state.pieces.find((item) => item.id === move.pieceId);
            return piece && ownBarrier(state, piece);
        });
        if (fromBarrier.length)
            return fromBarrier;
    }
    return moves;
}
function nextColor(current, presentColors) {
    const currentIndex = game_rules_config_1.COLOR_ORDER.indexOf(current);
    for (let offset = 1; offset <= game_rules_config_1.COLOR_ORDER.length; offset++) {
        const candidate = game_rules_config_1.COLOR_ORDER[(currentIndex + offset) % game_rules_config_1.COLOR_ORDER.length];
        if (presentColors.includes(candidate))
            return candidate;
    }
    return current;
}
//# sourceMappingURL=game-engine.js.map