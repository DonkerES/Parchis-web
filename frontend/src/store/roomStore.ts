import { create } from 'zustand'
import type { RoomSummary } from '../types/rooms'

interface RoomState {
  playerName: string
  rooms: RoomSummary[]
  currentRoomId: string | null
  setPlayerName: (name: string) => void
  setRooms: (rooms: RoomSummary[]) => void
  setCurrentRoomId: (roomId: string | null) => void
}

const savedName = sessionStorage.getItem('parchis-player-name') ?? ''

export const useRoomStore = create<RoomState>((set) => ({
  playerName: savedName,
  rooms: [],
  currentRoomId: null,
  setPlayerName: (playerName) => {
    sessionStorage.setItem('parchis-player-name', playerName)
    set({ playerName })
  },
  setRooms: (rooms) => set({ rooms }),
  setCurrentRoomId: (currentRoomId) => set({ currentRoomId }),
}))
