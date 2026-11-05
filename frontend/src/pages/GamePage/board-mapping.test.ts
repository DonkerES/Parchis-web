import { describe, expect, it } from 'vitest'
import {
  SAFE_SQUARES,
  TRACK_COORDS,
  lanePosition,
  HOME_CENTERS,
  LANE_SIDE,
  homeSlotCenter,
  pieceGridPosition,
  trackSquare,
  type BoardColor,
} from './board-mapping'

const colors: BoardColor[] = ['red', 'blue', 'yellow', 'green']

describe('Parchis board mapping', () => {
  it('maps all 68 squares to distinct valid track cells', () => {
    const coordinates = new Set<string>()

    for (let square = 1; square <= 68; square++) {
      const position = TRACK_COORDS[square]
      expect(position).not.toBeNull()
      if (!position) continue

      const key = `${position.x}:${position.y}`
      expect(coordinates.has(key)).toBe(false)
      coordinates.add(key)
      expect(position.x >= 8 && position.x <= 10 && position.y >= 8 && position.y <= 10).toBe(false)
      expect(position.x >= 0 && position.x <= 7 && position.y >= 0 && position.y <= 7).toBe(false)
      expect(position.x >= 11 && position.x <= 18 && position.y >= 0 && position.y <= 7).toBe(false)
      expect(position.x >= 0 && position.x <= 7 && position.y >= 11 && position.y <= 18).toBe(false)
      expect(position.x >= 11 && position.x <= 18 && position.y >= 11 && position.y <= 18).toBe(false)
    }
  })

  it('makes consecutive squares neighbors except the four diagonal jumps', () => {
    const jumps = new Set([8, 25, 42, 59])
    for (let square = 1; square < 68; square++) {
      const from = TRACK_COORDS[square]
      const to = TRACK_COORDS[square + 1]
      expect(from).not.toBeNull()
      expect(to).not.toBeNull()
      if (!from || !to) continue
      const dx = Math.abs(to.x - from.x)
      const dy = Math.abs(to.y - from.y)
      if (jumps.has(square)) {
        expect(dx).toBe(1)
        expect(dy).toBe(1)
      } else {
        expect(dx + dy).toBe(1)
      }
    }
  })

  it('uses the source-of-truth safe square coordinates', () => {
    const expected = new Map([
      [5, [4, 8]], [12, [8, 4]], [17, [9, 0]], [22, [10, 4]],
      [29, [14, 8]], [34, [18, 9]], [39, [14, 10]], [46, [10, 14]],
      [51, [9, 18]], [56, [8, 14]], [63, [4, 10]], [68, [0, 9]],
    ])
    expect([...SAFE_SQUARES].sort((a, b) => a - b)).toEqual([...expected.keys()].sort((a, b) => a - b))

    for (const [square, [x, y]] of expected) {
      expect(TRACK_COORDS[square]).toEqual({ x, y })
    }
  })

  it('maps progress 0 through 71 through valid route positions', () => {
    for (const color of colors) {
      for (let progress = 0; progress <= 63; progress++) {
        expect(pieceGridPosition(color, progress, 0).valid).toBe(true)
      }
      for (let laneIndex = 0; laneIndex <= 6; laneIndex++) {
        expect(lanePosition(color, laneIndex)).toBeDefined()
        expect(pieceGridPosition(color, 64 + laneIndex, 0).valid).toBe(true)
      }
      expect(pieceGridPosition(color, 71, 0).valid).toBe(true)
    }
  })

  it('maps each color tip from progress 63 and exit from progress 0', () => {
    expect(trackSquare('red', 63)).toBe(68)
    expect(trackSquare('blue', 63)).toBe(17)
    expect(trackSquare('yellow', 63)).toBe(34)
    expect(trackSquare('green', 63)).toBe(51)

    expect(trackSquare('red', 0)).toBe(5)
    expect(trackSquare('blue', 0)).toBe(22)
    expect(trackSquare('yellow', 0)).toBe(39)
    expect(trackSquare('green', 0)).toBe(56)
  })

  it('centers all four home slots on the shared home centers', () => {
    for (const color of colors) {
      const positions = []
      for (let index = 0; index < 4; index++) {
        expect(pieceGridPosition(color, -1, index).valid).toBe(true)
        positions.push(homeSlotCenter(color, index))
      }
      const average = {
        x: positions.reduce((sum, position) => sum + position.x, 0) / positions.length,
        y: positions.reduce((sum, position) => sum + position.y, 0) / positions.length,
      }
      expect(average.x).toBe(HOME_CENTERS[color].x)
      expect(average.y).toBe(HOME_CENTERS[color].y)
    }
  })

  it('aligns each lane with its matching triangle side', () => {
    expect(LANE_SIDE.red).toBe('left')
    expect(LANE_SIDE.blue).toBe('top')
    expect(LANE_SIDE.yellow).toBe('right')
    expect(LANE_SIDE.green).toBe('bottom')
  })
})
