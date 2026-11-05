import { io, type Socket } from 'socket.io-client'
import type { RoomError, RoomSummary } from '../types/rooms'
import { mockServer } from './mockServer'

const useMock = import.meta.env.VITE_USE_MOCK === 'true'

interface RoomService {
  listRooms: (onRooms: (rooms: RoomSummary[]) => void) => () => void
  createRoom: (data: { name: string; maxPlayers: 2 | 3 | 4; password?: string; playerName?: string }) => Promise<{ roomId: string; error?: RoomError }>
  joinRoom: (roomId: string, playerName: string, password?: string) => Promise<{ roomId: string; playerId: string; error?: RoomError }>
  leaveRoom: (roomId: string, playerName?: string) => Promise<void>
  subscribePlayers: (roomId: string, onPlayers: (state: { players: string[]; hostName: string | null; phase: 'waiting' | 'countdown' | 'playing' | 'finished' }) => void) => () => void
  startGame: (roomId: string, playerName: string) => Promise<{ phase: 'waiting' | 'playing'; error?: RoomError }>
  startGameSocket: (roomId: string, playerName: string) => void
  rollDie: (roomId: string, playerName: string) => void
  movePiece: (roomId: string, playerName: string, pieceId: string) => void
  subscribeGame: (roomId: string, handlers: {
    onState?: (state: unknown) => void
    onRoomState?: (phase: 'waiting' | 'countdown' | 'playing' | 'finished') => void
    onCountdown?: (payload: { startsAt: number; serverNow: number; seconds: number }) => void
    onRolled?: (payload: { color: string; value: number }) => void
    onEvent?: (event: unknown) => void
    onOver?: (payload: unknown) => void
    onError?: (error: RoomError) => void
  }) => () => void
}

let socket: Socket | null = null

function getSocket() {
  if (!socket) socket = io(import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000', { autoConnect: true })
  return socket
}

export const roomService: RoomService = useMock
  ? {
      listRooms(onRooms) {
        return mockServer.subscribe(onRooms)
      },
      async createRoom({ name, maxPlayers, password, playerName }) {
        return mockServer.create(name, maxPlayers, password, playerName)
      },
      async joinRoom(roomId, playerName, password) {
        const result = mockServer.join(roomId, password, playerName)
        if ('error' in result) return { roomId, playerId: '', error: result.error }
        return result
      },
      async leaveRoom(roomId, playerName) {
        mockServer.leave(roomId, playerName)
      },
      subscribePlayers(roomId, onPlayers) {
        return mockServer.subscribePlayers(roomId, (state) => onPlayers({
          players: state.players,
          hostName: state.hostName,
          phase: state.phase,
        }))
      },
      async startGame(roomId, playerName) {
        return mockServer.start(roomId, playerName)
      },
      startGameSocket(_roomId, _playerName) {},
      rollDie() {},
      movePiece() {},
      subscribeGame(_roomId, _handlers) { return () => {} },
    }
  : {
      listRooms(onRooms) {
        const client = getSocket()
        client.emit('room:list')
        const onList = (rooms: RoomSummary[]) => onRooms(rooms)
        client.on('rooms:list', onList)
        client.on('rooms:updated', onList)
        return () => {
          client.off('rooms:list', onList)
          client.off('rooms:updated', onList)
        }
      },
      createRoom(data) {
        return new Promise((resolve) => {
          getSocket().emit('room:create', data, (response: { roomId: string; error?: RoomError }) => resolve(response))
        })
      },
      joinRoom(roomId, playerName, password) {
        return new Promise((resolve) => {
          getSocket().emit('room:join', { roomId, playerName, password }, (response: { roomId: string; playerId: string; error?: RoomError }) => resolve(response))
        })
      },
      leaveRoom(roomId, playerName) {
        getSocket().emit('room:leave', { roomId, playerName })
        return Promise.resolve()
      },
      subscribePlayers(roomId, onPlayers) {
        const client = getSocket()
        const onRoster = (payload: { roomId: string; players: string[]; hostName: string | null; phase: 'waiting' | 'countdown' | 'playing' | 'finished' }) => {
          if (payload.roomId === roomId) onPlayers({
            players: payload.players,
            hostName: payload.hostName,
            phase: payload.phase,
          })
        }
        client.on('room:players', onRoster)
        client.emit('room:players', { roomId })
        return () => client.off('room:players', onRoster)
      },
      startGame(roomId, playerName) {
        return new Promise((resolve) => {
          getSocket().emit('game:start', { roomId, playerName })
          resolve({ phase: 'waiting' })
        })
      },
      startGameSocket(roomId, playerName) {
        getSocket().emit('game:start', { roomId, playerName })
      },
      rollDie(roomId, playerName) {
        getSocket().emit('game:roll', { roomId, playerName })
      },
      movePiece(roomId, playerName, pieceId) {
        getSocket().emit('game:move', { roomId, playerName, pieceId })
      },
      subscribeGame(_roomId, handlers) {
        const client = getSocket()
        const onState = (state: unknown) => handlers.onState?.(state)
        const onRoomState = (payload: { roomId: string; phase: 'waiting' | 'countdown' | 'playing' | 'finished' }) => {
          if (payload.roomId === _roomId) handlers.onRoomState?.(payload.phase)
        }
        const onCountdown = (payload: { startsAt: number; serverNow: number; seconds: number }) => handlers.onCountdown?.(payload)
        const onRolled = (payload: { color: string; value: number }) => handlers.onRolled?.(payload)
        const onEvent = (event: unknown) => handlers.onEvent?.(event)
        const onOver = (payload: unknown) => handlers.onOver?.(payload)
        const onError = (error: RoomError) => handlers.onError?.(error)
        client.on('game:state', onState)
        client.on('room:state', onRoomState)
        client.on('game:countdown', onCountdown)
        client.on('game:rolled', onRolled)
        client.on('game:event', onEvent)
        client.on('game:over', onOver)
        client.on('error:message', onError)
        client.emit('room:sync')
        return () => {
          client.off('game:state', onState)
          client.off('room:state', onRoomState)
          client.off('game:countdown', onCountdown)
          client.off('game:rolled', onRolled)
          client.off('game:event', onEvent)
          client.off('game:over', onOver)
          client.off('error:message', onError)
        }
      },
    }
