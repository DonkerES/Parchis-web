import type { BoardColor } from '../../pages/GamePage/board-mapping'
import {
  CALL_COLORS,
  type CallClient,
  type CallEvents,
  type CallParticipant,
  type CallState,
} from './types'

const DEMO_COLORS: Record<BoardColor, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
}

export class MockCallClient implements CallClient {
  private readonly listeners = new Map<keyof CallEvents, Set<(payload: never) => void>>()
  private participants = new Map<string, CallParticipant>()
  private localId: string | null = null

  async join(_roomId: string, me: { id: string; name: string; color: BoardColor }): Promise<void> {
    if (this.localId === me.id) return
    this.leave()
    this.localId = me.id
    this.participants.set(me.id, {
      ...me,
      micOn: false,
      camOn: false,
      stream: new MediaStream(),
      isLocal: true,
    })
    for (const color of CALL_COLORS) {
      if (color === me.color) continue
      const id = `demo-${color}`
      this.participants.set(id, {
        id,
        name: 'Jugador de prueba',
        color,
        micOn: true,
        camOn: true,
        stream: this.createDemoStream(color),
        isLocal: false,
      })
    }
    this.publish()
    this.setState('joined')
  }

  leave(): void {
    for (const participant of this.participants.values()) {
      participant.stream.getTracks().forEach((track) => track.stop())
    }
    this.participants.clear()
    this.localId = null
    this.publish()
    this.setState('idle')
  }

  async toggleMic(): Promise<void> {
    const local = this.getLocal()
    local.micOn = !local.micOn
    this.publish()
  }

  async toggleCamera(): Promise<void> {
    const local = this.getLocal()
    const wasOn = local.camOn
    local.stream.getTracks().forEach((track) => track.stop())
    local.stream = wasOn ? new MediaStream() : this.createDemoStream(local.color)
    local.camOn = !wasOn
    this.publish()
  }

  sendReaction(type: string): void {
    const local = this.getLocal()
    this.emit('reaction', { id: local.id, name: local.name, color: local.color, type })
  }

  on<Event extends keyof CallEvents>(
    event: Event,
    callback: (payload: CallEvents[Event]) => void,
  ): () => void {
    const callbacks = this.listeners.get(event) ?? new Set<(payload: never) => void>()
    callbacks.add(callback as (payload: never) => void)
    this.listeners.set(event, callbacks)
    return () => callbacks.delete(callback as (payload: never) => void)
  }

  private getLocal(): CallParticipant {
    const participant = this.localId ? this.participants.get(this.localId) : undefined
    if (!participant) throw new Error('Únete a la llamada antes de usar sus controles.')
    return participant
  }

  private createDemoStream(color: BoardColor): MediaStream {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 200
    const context = canvas.getContext('2d')
    if (context) {
      context.fillStyle = DEMO_COLORS[color]
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#ffffff'
      context.font = 'bold 24px sans-serif'
      context.textAlign = 'center'
      context.fillText('SFU MOCK', canvas.width / 2, canvas.height / 2)
    }
    return canvas.captureStream(10)
  }

  private publish(): void {
    const participants = [...this.participants.values()]
    this.emit('participants', participants)
    this.emit('streams', participants)
  }

  private setState(state: CallState, message?: string): void {
    this.emit('state', { state, message })
  }

  private emit<Event extends keyof CallEvents>(event: Event, payload: CallEvents[Event]): void {
    for (const callback of this.listeners.get(event) ?? []) callback(payload as never)
  }
}
