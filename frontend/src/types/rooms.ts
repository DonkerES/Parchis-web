export interface RoomSummary {
  id: string
  name: string
  players: number
  maxPlayers: 2 | 3 | 4
  hasPassword: boolean
  phase: 'waiting' | 'countdown' | 'playing' | 'finished'
}

export interface RoomError {
  code: string
  message: string
}
