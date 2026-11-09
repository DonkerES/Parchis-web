import { describe, expect, it } from 'vitest'
import { decodeParticipant, encodeParticipant } from './types'

describe('SFU participant identity', () => {
  it('encodes and decodes the color, id and name in the server string field', () => {
    const encoded = encodeParticipant({ id: 'a1b2c3d4', name: 'Ana|María', color: 'yellow' })

    expect(decodeParticipant(encoded, 'socket-id')).toEqual({
      id: 'a1b2c3d4',
      name: 'Ana|María',
      color: 'yellow',
    })
  })

  it('does not assign a false color to legacy participant names', () => {
    expect(decodeParticipant('Ana', 'socket-id')).toEqual({
      id: 'socket-id',
      name: 'Ana',
      color: null,
    })
  })
})
