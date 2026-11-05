import type { RoomSummary } from '../types/rooms'

type Listener = (rooms: RoomSummary[]) => void
type RosterListener = (payload: { roomId: string; players: string[]; hostName: string | null; phase: 'waiting' | 'countdown' | 'playing' | 'finished' }) => void

const rooms: Array<RoomSummary & { password?: string; playerNames: string[]; hostName: string }> = []

class MockServer {
  private listeners = new Set<Listener>()
  private rosterListeners = new Set<RosterListener>()

  list(): RoomSummary[] {
    return rooms
      .filter((room) => room.phase !== 'finished')
      .map(({ password: _password, playerNames: _playerNames, hostName: _hostName, ...room }) => room)
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    listener(this.list())
    return () => this.listeners.delete(listener)
  }

  private publish() {
    const current = this.list()
    this.listeners.forEach((listener) => listener(current))
  }

  create(name: string, maxPlayers: 2 | 3 | 4, password?: string, playerName?: string) {
    const id = `sala-${Math.random().toString(36).slice(2, 8)}`
    rooms.unshift({
      id,
      name,
      players: 1,
      maxPlayers,
      hasPassword: Boolean(password),
      password,
      phase: 'waiting',
      playerNames: playerName?.trim() ? [playerName.trim()] : [],
      hostName: playerName?.trim() ?? '',
    })
    this.publish()
    this.publishRoster(id)
    return { roomId: id }
  }

  join(roomId: string, password?: string, playerName?: string) {
    const room = rooms.find((item) => item.id === roomId)
    if (!room) return { error: { code: 'ROOM_NOT_FOUND', message: 'La sala no existe.' } }
    if (room.phase === 'playing' || room.phase === 'countdown' || room.phase === 'finished') return { error: { code: 'GAME_IN_PROGRESS', message: 'La partida ya está en juego.' } }
    if (room.players >= room.maxPlayers) return { error: { code: 'ROOM_FULL', message: 'La sala está llena.' } }
    if (room.hasPassword && room.password !== password) {
      return { error: { code: 'WRONG_PASSWORD', message: 'La contraseña es incorrecta.' } }
    }
    room.players += 1
    if (playerName?.trim()) room.playerNames.push(playerName.trim())
    this.publish()
    this.publishRoster(roomId)
    return { roomId, playerId: `player-${Math.random().toString(36).slice(2, 8)}` }
  }

  leave(roomId: string, playerName?: string) {
    const room = rooms.find((item) => item.id === roomId)
    if (!room) return
    if (room.players > 0) room.players -= 1
    if (playerName) {
      const index = room.playerNames.indexOf(playerName)
      if (index >= 0) room.playerNames.splice(index, 1)
    } else {
      room.playerNames.pop()
    }
    if (room.players === 0) {
      rooms.splice(rooms.indexOf(room), 1)
      this.publish()
      this.publishRoster(roomId)
      return
    }
    if (room.phase === 'countdown' && room.players < 2) room.phase = 'waiting'
    if (room.hostName === playerName || !room.playerNames.includes(room.hostName)) {
      room.hostName = room.playerNames[0] ?? ''
    }
    this.publish()
    this.publishRoster(roomId)
  }

  subscribePlayers(roomId: string, listener: RosterListener) {
    const wrapped: RosterListener = (payload) => listener(payload)
    this.rosterListeners.add(wrapped)
    const room = rooms.find((item) => item.id === roomId)
    listener({ roomId, players: room?.playerNames.slice(0, 4) ?? [], hostName: room?.hostName || null, phase: room?.phase ?? 'waiting' })
    return () => this.rosterListeners.delete(wrapped)
  }

  private publishRoster(roomId: string) {
    const room = rooms.find((item) => item.id === roomId)
    const payload = { roomId, players: room?.playerNames.slice(0, 4) ?? [], hostName: room?.hostName || null, phase: room?.phase ?? 'waiting' }
    this.rosterListeners.forEach((listener) => listener(payload))
  }

  start(roomId: string, playerName: string) {
    const room = rooms.find((item) => item.id === roomId)
    if (!room) return { phase: 'waiting' as const, error: { code: 'ROOM_NOT_FOUND', message: 'La sala no existe.' } }
    if (room.hostName !== playerName) return { phase: 'waiting' as const, error: { code: 'INVALID_DATA', message: 'Solo el anfitrión puede comenzar la partida.' } }
    room.phase = 'playing'
    this.publish()
    this.publishRoster(roomId)
    return { phase: 'playing' as const }
  }
}

export const mockServer = new MockServer()
