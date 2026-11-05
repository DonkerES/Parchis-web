import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RoomCard from './RoomCard'
import { roomService } from '../../services/roomService'
import { useRoomStore } from '../../store/roomStore'
import './LobbyPage.css'

export default function LobbyPage() {
  const navigate = useNavigate()
  const playerName = useRoomStore((state) => state.playerName)
  const rooms = useRoomStore((state) => state.rooms)
  const setPlayerName = useRoomStore((state) => state.setPlayerName)
  const setRooms = useRoomStore((state) => state.setRooms)
  const setCurrentRoomId = useRoomStore((state) => state.setCurrentRoomId)
  const [nameError, setNameError] = useState('')
  const [joinError, setJoinError] = useState('')

  useEffect(() => {
    const unsubscribe = roomService.listRooms(setRooms)
    setCurrentRoomId(null)
    return unsubscribe
  }, [setRooms, setCurrentRoomId])

  const requireName = () => {
    if (!playerName.trim()) {
      setNameError('Ingresa tu nombre antes de continuar.')
      return false
    }
    setNameError('')
    return true
  }

  const joinRoom = async (roomId: string, password?: string) => {
    if (!requireName()) return
    setJoinError('')
    const result = await roomService.joinRoom(roomId, playerName.trim(), password)
    if (result.error) {
      setJoinError(result.error.message)
      return
    }
    setCurrentRoomId(result.roomId)
    navigate(`/sala/${result.roomId}`)
  }

  return (
    <main className="lobby-page">
      <section className="lobby-panel">
        <header className="lobby-header">
          <div>
            <span className="lobby-eyebrow">PARCHÍS ONLINE</span>
            <h1>Partidas disponibles</h1>
          </div>
          <button
            className="create-room-button"
            type="button"
            onClick={() => {
              if (requireName()) navigate('/crear')
            }}
          >
            + Crear partida
          </button>
        </header>

        <label className="player-name-field">
          Nombre del jugador
          <input
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            placeholder="Ej. Ana"
            maxLength={24}
          />
        </label>
        {(nameError || joinError) && <p className="lobby-error">{nameError || joinError}</p>}

        <div className="room-list">
          {rooms.length === 0 ? (
            <p className="empty-state">No hay partidas todavía. ¡Crea la primera!</p>
          ) : (
            rooms.map((room) => <RoomCard key={room.id} room={room} onJoin={joinRoom} />)
          )}
        </div>
      </section>
    </main>
  )
}