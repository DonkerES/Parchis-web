import { useState } from 'react'
import type { RoomSummary } from '../../types/rooms'

interface Props {
  room: RoomSummary
  onJoin: (roomId: string, password?: string) => Promise<void>
}

export default function RoomCard({ room, onJoin }: Props) {
  const [askPassword, setAskPassword] = useState(false)
  const [password, setPassword] = useState('')
  const locked = room.hasPassword
  const unavailable = room.players >= room.maxPlayers || room.phase === 'playing' || room.phase === 'countdown'

  const handleJoin = async () => {
    if (locked && !askPassword) {
      setAskPassword(true)
      return
    }
    await onJoin(room.id, password || undefined)
  }

  return (
    <article className="room-card">
      <div className="room-card-main">
        <div className="room-card-title">
          <h2>{room.name}</h2>
          {locked && <span className="lock-icon" title="Sala con contraseña" aria-label="Sala con contraseña">🔒</span>}
        </div>
        <p>{room.players}/{room.maxPlayers} jugadores</p>
        <span className={`room-phase ${room.phase}`}>
          {room.phase === 'waiting' ? 'Esperando' : 'En juego'}
        </span>
      </div>
      {askPassword && (
        <label className="password-inline">
          Contraseña
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={24} />
        </label>
      )}
      <button
        className="join-button"
        type="button"
        disabled={unavailable}
        onClick={handleJoin}
      >
        {room.phase === 'playing' || room.phase === 'countdown' ? 'En juego' : room.players >= room.maxPlayers ? 'Sala llena' : askPassword ? 'Confirmar' : 'Unirse'}
      </button>
    </article>
  )
}