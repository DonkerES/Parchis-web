export type BoardColor = 'red' | 'blue' | 'yellow' | 'green'
export type GridPosition = { x: number; y: number }
export type PiecePosition = GridPosition & { valid: boolean }

export const TRACK_START: Record<BoardColor, number> = {
  red: 5,
  blue: 22,
  yellow: 39,
  green: 56,
}

export const SAFE_SQUARES = new Set([5, 12, 17, 22, 29, 34, 39, 46, 51, 56, 63, 68])

export const LANE_SIDE: Record<BoardColor, 'left' | 'top' | 'right' | 'bottom'> = {
  red: 'left',
  blue: 'top',
  yellow: 'right',
  green: 'bottom',
}

export const HOME_CENTERS: Record<BoardColor, GridPosition> = {
  red: { x: 4, y: 4 },
  blue: { x: 15, y: 4 },
  yellow: { x: 15, y: 15 },
  green: { x: 4, y: 15 },
}

export function trackSquare(color: BoardColor, progress: number): number {
  return ((TRACK_START[color] - 1 + progress) % 68) + 1
}

export function buildTrackCoordinates(): Array<GridPosition | null> {
  const coordinates = Array.from({ length: 69 }, () => null) as Array<GridPosition | null>

  for (let square = 1; square <= 8; square++) coordinates[square] = { x: square - 1, y: 8 }
  for (let square = 9; square <= 16; square++) coordinates[square] = { x: 8, y: 16 - square }
  coordinates[17] = { x: 9, y: 0 }
  for (let square = 18; square <= 25; square++) coordinates[square] = { x: 10, y: square - 18 }
  for (let square = 26; square <= 33; square++) coordinates[square] = { x: square - 15, y: 8 }
  coordinates[34] = { x: 18, y: 9 }
  for (let square = 35; square <= 42; square++) coordinates[square] = { x: 53 - square, y: 10 }
  for (let square = 43; square <= 50; square++) coordinates[square] = { x: 10, y: square - 32 }
  coordinates[51] = { x: 9, y: 18 }
  for (let square = 52; square <= 59; square++) coordinates[square] = { x: 8, y: 70 - square }
  for (let square = 60; square <= 67; square++) coordinates[square] = { x: 67 - square, y: 10 }
  coordinates[68] = { x: 0, y: 9 }

  return coordinates
}

export const TRACK_COORDS = buildTrackCoordinates()

export function homeSlotCenter(color: BoardColor, index: number): GridPosition {
  const center = HOME_CENTERS[color]
  const column = index % 2 === 0 ? center.x - 1.2 : center.x + 1.2
  const row = index < 2 ? center.y - 1.2 : center.y + 1.2
  return { x: column, y: row }
}

export function lanePosition(color: BoardColor, laneIndex: number): GridPosition {
  if (color === 'red') return { x: 1 + laneIndex, y: 9 }
  if (color === 'blue') return { x: 9, y: 1 + laneIndex }
  if (color === 'yellow') return { x: 17 - laneIndex, y: 9 }
  return { x: 9, y: 17 - laneIndex }
}

export function goalPosition(color: BoardColor, index: number): GridPosition {
  const goals: Record<BoardColor, GridPosition[]> = {
    red: [{ x: 8.45, y: 8.55 }, { x: 8.45, y: 9.45 }, { x: 9.15, y: 8.55 }, { x: 9.15, y: 9.45 }],
    blue: [{ x: 8.55, y: 8.45 }, { x: 9.45, y: 8.45 }, { x: 8.55, y: 9.15 }, { x: 9.45, y: 9.15 }],
    yellow: [{ x: 9.55, y: 8.55 }, { x: 9.55, y: 9.45 }, { x: 10.55, y: 8.55 }, { x: 10.55, y: 9.45 }],
    green: [{ x: 8.55, y: 9.55 }, { x: 9.45, y: 9.55 }, { x: 8.55, y: 10.55 }, { x: 9.45, y: 10.55 }],
  }
  return goals[color][index % 4]
}

export function isInvalidBoardPosition(position: GridPosition): boolean {
  const outside = position.x < 0 || position.y < 0 || position.x > 18 || position.y > 18
  const center = position.x >= 8 && position.x <= 10 && position.y >= 8 && position.y <= 10
  const house = (position.x >= 0 && position.x <= 7 && position.y >= 0 && position.y <= 7)
    || (position.x >= 11 && position.x <= 18 && position.y >= 0 && position.y <= 7)
    || (position.x >= 0 && position.x <= 7 && position.y >= 11 && position.y <= 18)
    || (position.x >= 11 && position.x <= 18 && position.y >= 11 && position.y <= 18)
  return outside || center || house
}

export function pieceGridPosition(
  color: BoardColor,
  progress: number,
  pieceIndex: number,
  debug: boolean = false,
): PiecePosition {
  let position: GridPosition

  if (progress === -1) {
    position = homeSlotCenter(color, pieceIndex)
  } else if (progress === 71) {
    position = goalPosition(color, pieceIndex)
  } else if (progress >= 64 && progress <= 70) {
    position = lanePosition(color, progress - 64)
  } else {
    const square = trackSquare(color, progress)
    position = TRACK_COORDS[square] ?? { x: 9, y: 9 }
  }

  const valid = progress === -1 || progress === 71 || !isInvalidBoardPosition(position)
  if (!valid && debug) {
    console.error('[board-mapping] Posición inválida de ficha', { color, progress, pieceIndex, position })
  }
  return { ...position, valid }
}
