import type { BoardColor } from '../../pages/GamePage/board-mapping'

export type CallState = 'idle' | 'connecting' | 'joined' | 'disconnected' | 'unavailable' | 'permission-denied'

export interface CallParticipant {
  id: string
  name: string
  color: BoardColor
  micOn: boolean
  camOn: boolean
  stream: MediaStream
  isLocal: boolean
}

export interface CallReaction {
  id: string
  name: string
  color: BoardColor
  type: string
}

export type CallEvents = {
  participants: CallParticipant[]
  streams: CallParticipant[]
  reaction: CallReaction
  state: { state: CallState; message?: string }
  error: Error
}

export interface CallClient {
  join(roomId: string, me: { id: string; name: string; color: BoardColor }): Promise<void>
  leave(): void
  toggleMic(): Promise<void>
  toggleCamera(): Promise<void>
  sendReaction(type: string): void
  on<Event extends keyof CallEvents>(event: Event, callback: (payload: CallEvents[Event]) => void): () => void
}

export const CALL_COLORS: readonly BoardColor[] = ['red', 'blue', 'green', 'yellow']

export function encodeParticipant(me: { id: string; name: string; color: BoardColor }): string {
  const identity = `${me.color}|${me.id}|${me.name}`
  if (identity.length > 50) {
    throw new Error('La identidad del participante supera el límite de 50 caracteres del SFU.')
  }
  return identity
}

export function decodeParticipant(participant: string, socketId: string): {
  id: string
  name: string
  color: BoardColor | null
} {
  const [color, id, ...nameParts] = participant.split('|')
  if (CALL_COLORS.includes(color as BoardColor) && id && nameParts.length) {
    return { id, name: nameParts.join('|'), color: color as BoardColor }
  }
  return { id: socketId, name: participant, color: null }
}
