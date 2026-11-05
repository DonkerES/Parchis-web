import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { roomService } from '../../services/roomService'
import { useRoomStore } from '../../store/roomStore'
import './CreateRoomPage.css'

export default function CreateRoomPage() {
  const navigate = useNavigate()
  const playerName = useRoomStore((state) => state.playerName)
  const setCurrentRoomId = useRoomStore((state) => state.setCurrentRoomId)
  const [name, setName] = useState('')
  const [maxPlayers, setMaxPlayers] = useState<2 | 3 | 4>(4)
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ name?: string; password?: string; server?: string }>({})
  const [submitting, setSubmitting] = useState(false)

  if (!playerName.trim()) return <Navigate to="/" replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors: { name?: string; password?: string; server?: string } = {}
    const trimmedName = name.trim()

    if (trimmedName.length < 3 || trimmedName.length > 24) {
      nextErrors.name = 'El nombre debe tener entre 3 y 24 caracteres.'
    }
    if (password.length > 24) {
      nextErrors.password = 'La contraseña no puede superar 24 caracteres.'
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    const result = await roomService.createRoom({
      name: trimmedName,
      maxPlayers,
      password: password || undefined,
      playerName: playerName.trim(),
    })
    if (result.error) {
      setErrors({ server: result.error.message })
      setSubmitting(false)
      return
    }
    setCurrentRoomId(result.roomId)
    navigate(`/sala/${result.roomId}`)
  }

  return (
    <main className="create-room-page">
      <form className="create-room-form" onSubmit={submit} noValidate>
        <header>
          <span className="lobby-eyebrow">NUEVA PARTIDA</span>
          <h1>Crear sala</h1>
        </header>

        <label>
          Nombre de la sala
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={24} />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </label>

        <label>
          Máximo de jugadores
          <select value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value) as 2 | 3 | 4)}>
            <option value={2}>2 jugadores</option>
            <option value={3}>3 jugadores</option>
            <option value={4}>4 jugadores</option>
          </select>
        </label>

        <label>
          Contraseña <span className="optional">(opcional)</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={24} />
          {errors.password && <span className="field-error">{errors.password}</span>}
        </label>

        {errors.server && <p className="field-error">{errors.server}</p>}

        <div className="create-actions">
          <button className="cancel-button" type="button" onClick={() => navigate('/')} disabled={submitting}>Cancelar</button>
          <button className="create-room-button" type="submit" disabled={submitting}>
            {submitting ? 'Creando...' : 'Crear partida'}
          </button>
        </div>
      </form>
    </main>
  )
}
