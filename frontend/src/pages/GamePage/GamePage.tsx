import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { roomService } from '../../services/roomService'
import { useRoomStore } from '../../store/roomStore'
import { ANIMATION_CONFIG } from './animation.config'
import {
  SAFE_SQUARES,
  TRACK_COORDS,
  LANE_SIDE,
  homeSlotCenter,
  pieceGridPosition,
  trackSquare,
  type BoardColor,
} from './board-mapping'
import './GamePage.css'

const BOARD_MARGIN = 10

const BOARD_SIZE = 760
const CELL = BOARD_SIZE / 19
const TOKEN_RADIUS = CELL * 0.34

type GamePiece = { id: string; color: 'red' | 'blue' | 'yellow' | 'green'; progress: number }
type GameTurn = {
  color: 'red' | 'blue' | 'yellow' | 'green'
  stage: 'roll' | 'move' | 'bonus'
  die: number | null
  bonus: 10 | 20 | null
  legalMoves: Array<{ pieceId: string; kind: string; steps: number; toProgress: number }>
}
type GameState = { roomId: string; pieces: GamePiece[]; turn: GameTurn; winner: string | null }
type GameEvent =
  | { type: 'exit'; pieceId: string }
  | { type: 'move'; pieceId: string; from: number; to: number }
  | { type: 'capture'; pieceId: string; capturedPieceIds: string[] }
  | { type: 'bonus'; color: GamePiece['color']; amount: 10 | 20 }
  | { type: 'bonus_lost'; color: GamePiece['color'] }
  | { type: 'goal'; pieceId: string }
  | { type: 'penalty'; color: GamePiece['color']; pieceId: string | null }
  | { type: 'no_moves'; color: GamePiece['color'] }
  | { type: 'turn'; color: GamePiece['color'] }

type PathAnimation = {
  pieceId: string
  points: Array<{ x: number; y: number }>
  durationMs: number
  color: GamePiece['color']
  key: number
  fromHome: boolean
}

function getPieceGridPosition(piece: GamePiece, _pieces: GamePiece[]): { x: number; y: number; valid: boolean } {
  const index = Number(piece.id.split('-')[1] ?? 0)
  const position = pieceGridPosition(
    piece.color as BoardColor,
    piece.progress,
    index,
    new URLSearchParams(window.location.search).get('debug') === '1',
  )
  return { x: position.x, y: position.y, valid: position.valid }
}

const wait = (durationMs: number) => new Promise<void>((resolve) => window.setTimeout(resolve, durationMs))

function getPieceColor(color: GamePiece['color']): string {
  return color === 'red' ? '#ef4444' : color === 'blue' ? '#3b82f6' : color === 'yellow' ? '#eab308' : '#22c55e'
}

function getPieceBorder(color: GamePiece['color']): string {
  return color === 'red' ? '#991b1b' : color === 'blue' ? '#1d4ed8' : color === 'yellow' ? '#a16207' : '#15803d'
}


function CameraIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 7l4-2v14l-4-2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h8z" />
      {!active && <path className="slash" d="M3 3l18 18" />}
    </svg>
  )
}

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
      {!active && <path className="slash" d="M3 3l18 18" />}
    </svg>
  )
}

function GamePage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const currentRoomId = useRoomStore((state) => state.currentRoomId)
  const playerName = useRoomStore((state) => state.playerName)
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)
  const [reaction, setReaction] = useState<string | null>(null)
  const [playerNames, setPlayerNames] = useState<string[]>([])
  const [hostName, setHostName] = useState<string | null>(null)
  const [phase, setPhase] = useState<'waiting' | 'countdown' | 'playing' | 'finished'>('waiting')
  const [startError, setStartError] = useState('')
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [countdown, setCountdown] = useState<{ remaining: number; message: string } | null>(null)
  const [gameOver, setGameOver] = useState<{ winner: { name: string; color: string }; reason: string } | null>(null)
  const [rolledValue, setRolledValue] = useState<number | null>(null)
  const [pendingRoll, setPendingRoll] = useState(false)
  const debugMode = new URLSearchParams(window.location.search).get('debug') === '1'
  const [debugColor, setDebugColor] = useState<GamePiece['color']>('red')
  const [debugProgress, setDebugProgress] = useState(-1)
  const reduceMotion = useReducedMotion()
  const [displayedState, setDisplayedState] = useState<GameState | null>(null)
  const [animating, setAnimating] = useState(false)
  const [highlightedSquares, setHighlightedSquares] = useState<Map<string, { color: GamePiece['color']; strong: boolean }>>(new Map())
  const [pathAnimation, setPathAnimation] = useState<PathAnimation | null>(null)
  const [impactAnimation, setImpactAnimation] = useState<{ square: { x: number; y: number }; color: GamePiece['color']; key: number } | null>(null)
  const [flightAnimations, setFlightAnimations] = useState<Array<{ piece: GamePiece; start: { x: number; y: number }; end: { x: number; y: number }; key: number }>>([])
  const [penaltyPieceId, setPenaltyPieceId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [bonusBanner, setBonusBanner] = useState<{ color: GamePiece['color']; amount: 10 | 20 } | null>(null)
  const eventQueueRef = useRef<GameEvent[]>([])
  const finalStateRef = useRef<GameState | null>(null)
  const displayedStateRef = useRef<GameState | null>(null)
  const processingRef = useRef(false)
  const stateSettleTimerRef = useRef<number | null>(null)
  const leavingRef = useRef(false)

  const showToast = (message: string) => {
    setToastMessage(message)
    window.setTimeout(() => setToastMessage((current) => current === message ? null : current), ANIMATION_CONFIG.toastDurationMs)
  }

  const replaceDisplayedState = (state: GameState) => {
    const copy = { ...state, pieces: state.pieces.map((piece) => ({ ...piece })), turn: { ...state.turn, legalMoves: state.turn.legalMoves.map((move) => ({ ...move })) } }
    displayedStateRef.current = copy
    setDisplayedState(copy)
  }

  const getProgressRoute = (piece: GamePiece, from: number, to: number): Array<{ x: number; y: number }> => {
    const route: Array<{ x: number; y: number }> = []
    if (from < 0) {
      route.push(getPieceGridPosition({ ...piece, progress: -1 }, []))
      route.push(getPieceGridPosition({ ...piece, progress: 0 }, []))
      return route
    }
    route.push(getPieceGridPosition({ ...piece, progress: from }, []))
    for (let progress = from + 1; progress <= to; progress++) {
      route.push(getPieceGridPosition({ ...piece, progress }, []))
    }
    return route
  }

  const highlightPath = async (route: Array<{ x: number; y: number }>, color: GamePiece['color'], destinationIndex: number) => {
    if (reduceMotion) {
      const source = route[0]
      const destination = route[route.length - 1]
      setHighlightedSquares(new Map([
        [`${source.x}:${source.y}`, { color, strong: false }],
        [`${destination.x}:${destination.y}`, { color, strong: true }],
      ]))
      await wait(ANIMATION_CONFIG.reducedMotionHighlightMs)
      setHighlightedSquares(new Map())
      return
    }
    const pathMap = new Map<string, { color: GamePiece['color']; strong: boolean }>()
    for (let index = 1; index < route.length; index++) {
      const point = route[index]
      const key = `${point.x}:${point.y}`
      pathMap.set(key, { color, strong: index === destinationIndex })
      setHighlightedSquares(new Map(pathMap))
      await wait(ANIMATION_CONFIG.pathWaveDelayMs)
    }
  }

  const animateMoveEvent = async (event: GameEvent & { type: 'move' | 'exit' }) => {
    const current = displayedStateRef.current
    if (!current) return
    const piece = current.pieces.find((item) => item.id === event.pieceId)
    if (!piece) return
    const from = event.type === 'exit' ? -1 : event.from
    const to = event.type === 'exit' ? 0 : event.to
    if (document.hidden || reduceMotion) {
      replaceDisplayedState({
        ...current,
        pieces: current.pieces.map((item) => item.id === piece.id ? { ...item, progress: to } : { ...item }),
      })
      const toPosition = TRACK_COORDS[trackSquare(piece.color, to)]
      const destination = toPosition ?? { x: to >= 0 ? 9 : getPieceGridPosition(piece, []).x, y: to >= 0 ? 9 : getPieceGridPosition(piece, []).y }
      setHighlightedSquares(new Map([[`${destination.x}:${destination.y}`, { color: piece.color, strong: true }]]))
      await wait(ANIMATION_CONFIG.reducedMotionHighlightMs)
      setHighlightedSquares(new Map())
      return
    }

    const route = getProgressRoute(piece, from, to)
    await highlightPath(route, piece.color, route.length - 1)
    const distance = Math.max(1, route.length - 1)
    const durationMs = Math.min(ANIMATION_CONFIG.totalMoveLimitMs, distance * ANIMATION_CONFIG.cellDurationMs)
    setPathAnimation({ pieceId: piece.id, points: route, durationMs, color: piece.color, key: Date.now(), fromHome: from < 0 })
    await wait(durationMs)
    setPathAnimation(null)
    replaceDisplayedState({
      ...current,
      pieces: current.pieces.map((item) => item.id === piece.id ? { ...item, progress: to } : { ...item }),
    })
    await wait(120)
    setHighlightedSquares(new Map())
  }

  const animateCaptureEvent = async (event: GameEvent & { type: 'capture' }) => {
    const current = displayedStateRef.current
    const capturer = current?.pieces.find((piece) => piece.id === event.pieceId)
    if (capturer) {
      const position = getPieceGridPosition(capturer, current?.pieces ?? [])
      setImpactAnimation({ square: position, color: capturer.color, key: Date.now() })
      await wait(ANIMATION_CONFIG.impactDurationMs)
      setImpactAnimation(null)
    }

    for (const [index, pieceId] of event.capturedPieceIds.entries()) {
      const victim = current?.pieces.find((piece) => piece.id === pieceId)
      if (!victim) continue
      const start = getPieceGridPosition(victim, current?.pieces ?? [])
      const end = getPieceGridPosition({ ...victim, progress: -1 }, [])
      setTimeout(() => {
        setFlightAnimations((flights) => [...flights, { piece: { ...victim, progress: -1 }, start, end, key: Date.now() + index }])
      }, index * ANIMATION_CONFIG.captureFlightDelayMs)
    }
    await wait(ANIMATION_CONFIG.flightDurationMs + event.capturedPieceIds.length * ANIMATION_CONFIG.captureFlightDelayMs)
    setFlightAnimations([])
    if (current) {
      replaceDisplayedState({
        ...current,
        pieces: current.pieces.map((piece) => event.capturedPieceIds.includes(piece.id) ? { ...piece, progress: -1 } : { ...piece }),
      })
    }
    showToast(event.capturedPieceIds.length > 0 ? `¡Captura! +20` : '¡Captura!')
  }

  const animatePenaltyEvent = async (event: GameEvent & { type: 'penalty' }) => {
    if (!event.pieceId) {
      showToast('Tres seises: sin castigo')
      await wait(ANIMATION_CONFIG.toastDurationMs > 1200 ? 700 : 400)
      return
    }
    const current = displayedStateRef.current
    if (!current) return
    const victim = current?.pieces.find((piece) => piece.id === event.pieceId)
    setPenaltyPieceId(event.pieceId)
    await wait(ANIMATION_CONFIG.penaltyBlinkMs)
    setPenaltyPieceId(null)
    if (victim) {
      const start = getPieceGridPosition(victim, current?.pieces ?? [])
      const end = getPieceGridPosition({ ...victim, progress: -1 }, [])
      setFlightAnimations([{ piece: { ...victim, progress: -1 }, start, end, key: Date.now() }])
      await wait(ANIMATION_CONFIG.flightDurationMs)
      setFlightAnimations([])
      replaceDisplayedState({
        ...current,
        pieces: current.pieces.map((piece) => piece.id === event.pieceId ? { ...piece, progress: -1 } : { ...piece }),
      })
    }
    showToast('Tres seises: la ficha vuelve a casa')
  }

  const processEventQueue = async () => {
    if (processingRef.current) return
    processingRef.current = true
    setAnimating(true)
    while (eventQueueRef.current.length > 0) {
      if (document.hidden || eventQueueRef.current.length > 20) {
        eventQueueRef.current = []
        break
      }
      const event = eventQueueRef.current.shift()
      if (!event) continue
      if (event.type === 'move' || event.type === 'exit') await animateMoveEvent(event)
      else if (event.type === 'capture') await animateCaptureEvent(event)
      else if (event.type === 'penalty') await animatePenaltyEvent(event)
      else if (event.type === 'bonus' && finalStateRef.current?.turn.stage === 'bonus') {
        setBonusBanner({ color: event.color, amount: event.amount })
        await wait(ANIMATION_CONFIG.toastDurationMs)
        setBonusBanner(null)
      } else if (event.type === 'bonus_lost') {
        setBonusBanner(null)
      }
    }
    if (finalStateRef.current) replaceDisplayedState(finalStateRef.current)
    setHighlightedSquares(new Map())
    setAnimating(false)
    processingRef.current = false
  }

  useEffect(() => {
    if (!roomId) return
    const unsubscribePlayers = roomService.subscribePlayers(roomId, (state) => {
      setPlayerNames(state.players)
      setHostName(state.hostName)
      setPhase(state.phase)
    })
    const unsubscribeGame = roomService.subscribeGame(roomId, {
      onState: (state) => {
        const nextState = state as GameState
        setGameState(nextState)
        finalStateRef.current = nextState
        if (!displayedStateRef.current) replaceDisplayedState(nextState)
        setPhase('playing')
        setPendingRoll(false)
        if (stateSettleTimerRef.current) window.clearTimeout(stateSettleTimerRef.current)
        stateSettleTimerRef.current = window.setTimeout(() => {
          if (!processingRef.current && eventQueueRef.current.length === 0 && finalStateRef.current) {
            replaceDisplayedState(finalStateRef.current)
          }
        }, 60)
      },
      onRoomState: (nextPhase) => setPhase(nextPhase),
      onCountdown: (payload) => {
        setPhase('countdown')
        const offset = payload.serverNow - Date.now()
        const update = () => {
          const remainingMs = payload.startsAt - (Date.now() + offset)
          const seconds = Math.max(0, Math.ceil(remainingMs / 1000))
          setCountdown({ remaining: seconds, message: seconds === 0 ? '¡Ya!' : String(seconds) })
        }
        update()
        const interval = window.setInterval(update, 200)
        window.setTimeout(() => { window.clearInterval(interval); setCountdown(null) }, 5200)
      },
      onRolled: (payload) => {
        setRolledValue(payload.value)
        setPendingRoll(false)
      },
      onEvent: (event) => {
        eventQueueRef.current.push(event as GameEvent)
        void processEventQueue()
      },
      onOver: (payload) => setGameOver(payload as { winner: { name: string; color: string }; reason: string }),
      onError: (error) => setStartError(error.message),
    })
    return () => {
      unsubscribePlayers()
      unsubscribeGame()
      if (stateSettleTimerRef.current) window.clearTimeout(stateSettleTimerRef.current)
    }
  }, [roomId])

  const rollDie = () => {
    if (!roomId) return
    if (!gameState || gameState.turn.stage !== 'roll') return
    if (pendingRoll || phase !== 'playing' || !myColor || gameState.turn.color !== myColor) return
    setPendingRoll(true)
    roomService.rollDie(roomId, playerName)
  }

  const simulateEvent = (events: GameEvent[]) => {
    const base = displayedStateRef.current ?? gameState
    if (!base) return
    replaceDisplayedState(base)
    eventQueueRef.current.push(...events)
    void processEventQueue()
  }

  const simulateMove = (to: number = 20) => {
    const base = displayedStateRef.current ?? gameState
    if (!base) return
    const piece: GamePiece = { id: `${debugColor}-debug`, color: debugColor, progress: debugProgress }
    const copy = { ...base, pieces: [...base.pieces.filter((item) => !item.id.endsWith('-debug')), piece] }
    replaceDisplayedState(copy)
    const from = Math.max(0, debugProgress)
    simulateEvent([{ type: 'move', pieceId: piece.id, from, to: Math.min(to, 71) }])
  }
  const setCurrentRoomId = useRoomStore((state) => state.setCurrentRoomId)

  if (!roomId || currentRoomId !== roomId) return <Navigate to="/" replace />

  const leaveRoom = async () => {
    if (leavingRef.current) return
    leavingRef.current = true
    console.log('[room:leave] Saliendo de la sala', roomId)
    void roomService.leaveRoom(roomId, playerName)
    setPhase('waiting')
    setGameState(null)
    setDisplayedState(null)
    displayedStateRef.current = null
    finalStateRef.current = null
    setCountdown(null)
    setGameOver(null)
    setRolledValue(null)
    setPendingRoll(false)
    setAnimating(false)
    setHighlightedSquares(new Map())
    setPathAnimation(null)
    setImpactAnimation(null)
    setFlightAnimations([])
    setPenaltyPieceId(null)
    setToastMessage(null)
    setBonusBanner(null)
    eventQueueRef.current = []
    if (stateSettleTimerRef.current) window.clearTimeout(stateSettleTimerRef.current)
    setCurrentRoomId(null)
    sessionStorage.removeItem('parchis-current-room')
    navigate('/', { replace: true })
  }

  const startGame = async () => {
    if (!roomId) return
    setStartError('')
    roomService.startGameSocket(roomId, playerName)
  }

  const assignedColors: GamePiece['color'][] = playerNames.length === 2
    ? ['red', 'yellow']
    : playerNames.length === 3
      ? ['red', 'blue', 'yellow']
      : ['red', 'blue', 'yellow', 'green']
  const myPlayerIndex = playerNames.findIndex((name) => name === playerName)
  const myColor = myPlayerIndex >= 0 ? assignedColors[myPlayerIndex] : undefined
  const turnPlayerIndex = gameState ? assignedColors.indexOf(gameState.turn.color) : -1
  const turnPlayerName = turnPlayerIndex >= 0 ? playerNames[turnPlayerIndex] : 'Jugador'
  const isMyTurn = Boolean(gameState && myColor === gameState.turn.color)
  const canRoll = phase === 'playing' && isMyTurn && gameState?.turn.stage === 'roll' && !pendingRoll && !animating
  let dieButtonText = `Turno de ${turnPlayerName}`
  let dieButtonDetail = 'ESPERANDO TURNO'
  if (canRoll) {
    dieButtonText = 'Lanzar dado'
    dieButtonDetail = 'TU TURNO'
  } else if (phase === 'playing' && isMyTurn && gameState?.turn.stage === 'move') {
    dieButtonText = 'Elige una ficha'
    dieButtonDetail = 'TU TURNO'
  } else if (phase === 'playing' && isMyTurn && gameState?.turn.stage === 'bonus') {
    dieButtonText = 'Elige una ficha'
    dieButtonDetail = `BONUS +${gameState.turn.bonus ?? 0}`
  } else if (phase === 'countdown' || phase === 'finished') {
    dieButtonText = phase === 'countdown' ? 'Iniciando partida' : 'Partida finalizada'
    dieButtonDetail = 'ESPERANDO'
  }

  return (
    <main className="game-shell">
      {(['red', 'blue', 'green', 'yellow'] as GamePiece['color'][]).map((playerColorName) => {
        const playerIndex = assignedColors.indexOf(playerColorName)
        const slotPlayerName = playerIndex >= 0 ? playerNames[playerIndex]?.trim() : ''
        const playerNameInSlot = slotPlayerName || 'Sin jugador'
        const playerColor = playerColorName === 'red' ? '#ef4444'
          : playerColorName === 'blue' ? '#3b82f6'
          : playerColorName === 'yellow' ? '#eab308'
          : '#22c55e'
        const corner = playerColorName === 'red' ? 'top-left'
          : playerColorName === 'blue' ? 'top-right'
          : playerColorName === 'yellow' ? 'bottom-right'
          : 'bottom-left'
        return (
        <section className={`camera-card ${corner}${slotPlayerName ? '' : ' empty'}`} key={playerColorName}>
          <div className="video-placeholder">
            <div className="avatar" style={{ '--player-color': playerColor } as CSSProperties }>
              {slotPlayerName ? slotPlayerName.charAt(0) : '?'}
            </div>
            <span className="camera-status">Cámara apagada</span>
          </div>
          <div className="player-label">
            <span className="player-dot" style={{ background: playerColor }} />
            <strong>{playerNameInSlot}</strong>
            <span className="connection-dot" title="Conectado" />
          </div>
        </section>
        )
      })}

      <section className="game-center" aria-label="Tablero de parchís">
        <header className="game-header">
          <div>
            <span className="room-code">SALA {roomId?.replace('sala-', '').toUpperCase()}</span>
            <span className="turn-badge"><i /> Turno de {turnPlayerName}</span>
          </div>
          <div className="game-header-actions">
            {phase === 'waiting' && hostName === playerName && (
              <button className="start-game-button" type="button" onClick={startGame}>
                Comenzar partida
              </button>
            )}
            <button className="leave-button" type="button" onClick={leaveRoom}>Salir</button>
          </div>
        </header>
        {startError && <div className="start-game-error">{startError}</div>}

        <div className="board-row">
          <div className="board-wrap">
            <svg className="board" viewBox="0 0 780 780" role="img" aria-label="Tablero ordenado de parchís">
            <rect
              x="10"
              y="10"
              width="760"
              height="760"
              rx="22"
              fill="#f8fafc"
              stroke="#1f2937"
              strokeWidth="8"
            />

            {[
              { x: 0, y: 0, colorName: 'red' as const, color: '#ef4444', border: '#991b1b', inner: '#fff7f7' },
              { x: 11, y: 0, colorName: 'blue' as const, color: '#3b82f6', border: '#1d4ed8', inner: '#f7faff' },
              { x: 0, y: 11, colorName: 'green' as const, color: '#22c55e', border: '#15803d', inner: '#f7fff8' },
              { x: 11, y: 11, colorName: 'yellow' as const, color: '#eab308', border: '#a16207', inner: '#fffdf0' },
            ].map((home, homeIndex) => {
              const homeX = BOARD_MARGIN + home.x * CELL
              const homeY = BOARD_MARGIN + home.y * CELL
              const homeSize = CELL * 8
              const innerSize = CELL * 4.8
              const innerX = homeX + (homeSize - innerSize) / 2
              const innerY = homeY + (homeSize - innerSize) / 2
              const participates = gameState?.pieces.some((piece) => piece.color === home.colorName)
                || (debugMode && assignedColors.includes(home.colorName))
              const mutedColor = `${home.color}55`

              return (
                <g key={`home-${homeIndex}`}>
                  <rect
                    x={homeX}
                    y={homeY}
                    width={homeSize}
                    height={homeSize}
                    rx={CELL * 0.16}
                    fill={participates ? home.color : mutedColor}
                  />
                  <rect
                    x={innerX}
                    y={innerY}
                    width={innerSize}
                    height={innerSize}
                    rx={CELL * 0.12}
                    fill={home.inner}
                    stroke={home.border}
                    strokeWidth={CELL * 0.08}
                  />
                  {Array.from({ length: 4 }, (_, slotIndex) => {
                    const slot = homeSlotCenter(home.colorName, slotIndex)
                    return (
                      <circle
                        key={`${homeIndex}-slot-${slotIndex}`}
                        cx={BOARD_MARGIN + slot.x * CELL}
                        cy={BOARD_MARGIN + slot.y * CELL}
                        r={TOKEN_RADIUS}
                        fill="none"
                        stroke={participates ? home.border : '#94a3b8'}
                        strokeOpacity={participates ? 0.55 : 0.25}
                        strokeWidth={CELL * 0.06}
                      />
                    )
                  })}
                </g>
              )
            })}

            {Array.from({ length: 19 }).map((_, row) =>
              Array.from({ length: 19 }).map((__, column) => {
                const isHorizontalArm = row >= 8 && row <= 10
                const isVerticalArm = column >= 8 && column <= 10
                if (!isHorizontalArm && !isVerticalArm) return null

                let fill = '#ffffff'
                if (row === 9 && column >= 0 && column <= 7) fill = '#fecaca'
                if (column === 9 && row >= 0 && row <= 7) fill = '#bfdbfe'
                if (row === 9 && column >= 11 && column <= 18) fill = '#fde68a'
                if (column === 9 && row >= 11 && row <= 18) fill = '#bbf7d0'
                if (
                  (row === 0 && column === 9) ||
                  (row === 9 && column === 0) ||
                  (row === 9 && column === 18) ||
                  (row === 18 && column === 9)
                ) fill = '#f1f5f9'

                return (
                  <rect
                    key={`cell-${row}-${column}`}
                    x={BOARD_MARGIN + column * CELL}
                    y={BOARD_MARGIN + row * CELL}
                    width={CELL}
                    height={CELL}
                    fill={fill}
                    stroke="#64748b"
                    strokeWidth="2"
                  />
                )
              }),
            )}

            {debugMode && Array.from({ length: 68 }, (_, index) => index + 1).map((square) => {
              const coordinate = TRACK_COORDS[square] ?? { x: 9, y: 9 }
              const isTip = [68, 17, 34, 51].includes(square)
              const isExit = [5, 22, 39, 56].includes(square)
              return (
                <g key={`debug-${square}`}>
                  <text
                    x={BOARD_MARGIN + coordinate.x * CELL + CELL * 0.16}
                    y={BOARD_MARGIN + coordinate.y * CELL + CELL * 0.38}
                    fontSize={CELL * 0.22}
                    fontWeight="800"
                    fill={isTip ? '#dc2626' : isExit ? '#2563eb' : '#0f172a'}
                  >
                    {square}
                  </text>
                  {isTip && <text x={BOARD_MARGIN + coordinate.x * CELL + CELL * 0.14} y={BOARD_MARGIN + coordinate.y * CELL + CELL * 0.78} fontSize={CELL * 0.16} fill="#dc2626">P</text>}
                  {isExit && <text x={BOARD_MARGIN + coordinate.x * CELL + CELL * 0.14} y={BOARD_MARGIN + coordinate.y * CELL + CELL * 0.78} fontSize={CELL * 0.16} fill="#2563eb">S</text>}
                </g>
              )
            })}

            {[...SAFE_SQUARES].map((square) => {
              const coordinate = TRACK_COORDS[square] ?? { x: 9, y: 9 }
              return (
                <path
                  key={`safe-${square}`}
                  className="safe-star"
                  d="M0 -7 L2 -2 L7 -2 L3 2 L4 7 L0 4 L-4 7 L-3 2 L-7 -2 L-2 -2 Z"
                  transform={`translate(${BOARD_MARGIN + coordinate.x * CELL + CELL / 2} ${BOARD_MARGIN + coordinate.y * CELL + CELL / 2}) scale(${CELL / 40})`}
                />
              )
            })}

            {[...highlightedSquares.entries()].map(([key, highlight]) => {
              const [x, y] = key.split(':').map(Number)
              return (
                <rect
                  key={`highlight-${key}`}
                  x={BOARD_MARGIN + x * CELL}
                  y={BOARD_MARGIN + y * CELL}
                  width={CELL}
                  height={CELL}
                  rx={CELL * 0.12}
                  fill={getPieceColor(highlight.color)}
                  fillOpacity={highlight.strong ? ANIMATION_CONFIG.pathDestinationOpacity : ANIMATION_CONFIG.pathIntermediateOpacity}
                  stroke={getPieceColor(highlight.color)}
                  strokeWidth={highlight.strong ? CELL * 0.12 : CELL * 0.07}
                  className="animated-path-square"
                />
              )
            })}

            <rect
              x={BOARD_MARGIN + 8 * CELL}
              y={BOARD_MARGIN + 8 * CELL}
              width={CELL * 3}
              height={CELL * 3}
              fill="#fff"
              stroke="#1f2937"
              strokeWidth={CELL * 0.07}
            />
            {(['red', 'blue', 'yellow', 'green'] as BoardColor[]).map((color) => {
              const left = BOARD_MARGIN + 8 * CELL
              const right = BOARD_MARGIN + 11 * CELL
              const top = BOARD_MARGIN + 8 * CELL
              const bottom = BOARD_MARGIN + 11 * CELL
              const side = LANE_SIDE[color]
              const d = side === 'left'
                ? `M390 390 L${left} ${top} V${bottom} Z`
                : side === 'top'
                  ? `M390 390 L${left} ${top} H${right} Z`
                  : side === 'right'
                    ? `M390 390 L${right} ${top} V${bottom} Z`
                    : `M390 390 L${left} ${bottom} H${right} Z`
              return <path key={`goal-${color}`} d={d} fill={getPieceColor(color)} />
            })}
            <circle cx="390" cy="390" r={CELL * 0.48} fill="#fff" stroke="#1f2937" strokeWidth={CELL * 0.09} />
            {(displayedState?.pieces ?? gameState?.pieces ?? []).map((piece) => {
              const pieceList = displayedState?.pieces ?? gameState?.pieces ?? []
              const position = getPieceGridPosition(piece, pieceList)
              const legal = !animating && Boolean(gameState?.turn.legalMoves.some((move) => move.pieceId === piece.id))
              if (pathAnimation?.pieceId === piece.id || flightAnimations.some((flight) => flight.piece.id === piece.id) || penaltyPieceId === piece.id) return null
              const color = getPieceColor(piece.color)
              const border = getPieceBorder(piece.color)
              const sameSquareIndex = pieceList.filter((other) =>
                other.id !== piece.id &&
                getPieceGridPosition(other, pieceList).x === position.x &&
                getPieceGridPosition(other, pieceList).y === position.y &&
                Number(other.id.split('-')[1]) < Number(piece.id.split('-')[1]),
              ).length
              const isHome = piece.progress === -1
              const cx = BOARD_MARGIN + position.x * CELL + (isHome ? 0 : CELL / 2) + (sameSquareIndex ? CELL * 0.14 : 0)
              const cy = BOARD_MARGIN + position.y * CELL + (isHome ? 0 : CELL / 2) + (sameSquareIndex ? CELL * 0.14 : 0)

              if (!position.valid && debugMode) {
                return (
                  <circle
                    key={`${piece.id}-invalid`}
                    cx={cx}
                    cy={cy}
                    r={CELL * 0.38}
                    fill="#ef4444"
                    stroke="#fff"
                    strokeWidth={CELL * 0.12}
                  />
                )
              }

              return (
                <circle
                  key={piece.id}
                  className={legal ? 'game-piece legal-piece' : 'game-piece'}
                  cx={cx}
                  cy={cy}
                  r={CELL * 0.34}
                  fill={color}
                  stroke={border}
                  strokeWidth={CELL * 0.07}
                  onClick={() => {
                    if (!animating && legal && roomId) roomService.movePiece(roomId, playerName, piece.id)
                  }}
                />
              )
            })}
            {debugMode && (() => {
              const debugPiece: GamePiece = { id: `debug-${debugColor}-0`, color: debugColor, progress: debugProgress }
              const position = getPieceGridPosition(debugPiece, [])
              const color = debugColor === 'red' ? '#ef4444' : debugColor === 'blue' ? '#3b82f6' : debugColor === 'yellow' ? '#eab308' : '#22c55e'
              const border = debugColor === 'red' ? '#991b1b' : debugColor === 'blue' ? '#1d4ed8' : debugColor === 'yellow' ? '#a16207' : '#15803d'
              return (
                <circle
                  cx={BOARD_MARGIN + position.x * CELL + (debugProgress === -1 ? 0 : CELL / 2)}
                  cy={BOARD_MARGIN + position.y * CELL + (debugProgress === -1 ? 0 : CELL / 2)}
                  r={CELL * 0.325}
                  fill={color}
                  stroke={border}
                  strokeWidth={CELL * 0.07}
                  opacity="0.95"
                />
              )
            })()}

            {penaltyPieceId && (() => {
              const penaltyPiece = displayedState?.pieces.find((piece) => piece.id === penaltyPieceId)
              if (!penaltyPiece) return null
              const position = getPieceGridPosition(penaltyPiece, displayedState?.pieces ?? [])
              return (
                <motion.circle
                  cx={BOARD_MARGIN + position.x * CELL + CELL / 2}
                  cy={BOARD_MARGIN + position.y * CELL + CELL / 2}
                  r={CELL * 0.325}
                  fill="#ef4444"
                  stroke="#7f1d1d"
                  strokeWidth={CELL * 0.09}
                  animate={{ opacity: [1, 0.15, 1, 0.15, 1] }}
                  transition={{ duration: ANIMATION_CONFIG.penaltyBlinkMs / 1000 }}
                />
              )
            })()}

            {impactAnimation && (
              <motion.circle
                key={`impact-${impactAnimation.key}`}
                cx={BOARD_MARGIN + impactAnimation.square.x * CELL + CELL / 2}
                cy={BOARD_MARGIN + impactAnimation.square.y * CELL + CELL / 2}
                r={CELL * 0.4}
                fill="none"
                stroke={getPieceColor(impactAnimation.color)}
                strokeWidth={CELL * 0.12}
                initial={{ r: CELL * 0.35, opacity: 1 }}
                animate={{ r: CELL * 1.05, opacity: 0 }}
                transition={{ duration: ANIMATION_CONFIG.impactDurationMs / 1000, ease: 'easeOut' }}
              />
            )}

            {pathAnimation && (
              <motion.circle
                key={`path-${pathAnimation.key}`}
                className="animated-moving-piece"
                cx={BOARD_MARGIN + pathAnimation.points[0].x * CELL + (pathAnimation.fromHome ? 0 : CELL / 2)}
                cy={BOARD_MARGIN + pathAnimation.points[0].y * CELL + (pathAnimation.fromHome ? 0 : CELL / 2)}
                r={CELL * 0.325}
                fill={getPieceColor(pathAnimation.color)}
                stroke={getPieceBorder(pathAnimation.color)}
                strokeWidth={CELL * 0.07}
                initial={{ scale: 1 }}
                animate={{
                  cx: pathAnimation.points.map((point, index) =>
                    BOARD_MARGIN + point.x * CELL + (pathAnimation.fromHome && index === 0 ? 0 : CELL / 2),
                  ),
                  cy: pathAnimation.points.map((point, index) =>
                    BOARD_MARGIN + point.y * CELL + (pathAnimation.fromHome && index === 0 ? 0 : CELL / 2),
                  ),
                  scale: pathAnimation.points.map((_, index) => index === pathAnimation.points.length - 1 ? 1.15 : 1),
                }}
                transition={{ duration: pathAnimation.durationMs / 1000, ease: 'easeInOut', times: pathAnimation.points.map((_, index) => index / Math.max(1, pathAnimation.points.length - 1)) }}
                style={{ transformOrigin: 'center' }}
              />
            )}

            {flightAnimations.map((flight) => {
              const startCx = BOARD_MARGIN + flight.start.x * CELL + CELL / 2
              const startCy = BOARD_MARGIN + flight.start.y * CELL + CELL / 2
              const endCx = BOARD_MARGIN + flight.end.x * CELL
              const endCy = BOARD_MARGIN + flight.end.y * CELL
              const midCx = (startCx + endCx) / 2
              const midCy = Math.min(startCy, endCy) - CELL * 1.8
              return (
                <motion.circle
                  key={`flight-${flight.key}`}
                  className="animated-flying-piece"
                  cx={startCx}
                  cy={startCy}
                  r={CELL * 0.325}
                  fill={getPieceColor(flight.piece.color)}
                  stroke={getPieceBorder(flight.piece.color)}
                  strokeWidth={CELL * 0.07}
                  animate={{ cx: [startCx, midCx, endCx], cy: [startCy, midCy, endCy], r: [CELL * 0.325, CELL * 0.19, CELL * 0.325] }}
                  transition={{ duration: ANIMATION_CONFIG.flightDurationMs / 1000, ease: 'easeInOut' }}
                />
              )
            })}

            </svg>
            {debugMode && (
              <div className="board-debug-controls" aria-label="Controles de depuración del tablero">
                <label>
                  Color
                  <select value={debugColor} onChange={(event) => setDebugColor(event.target.value as GamePiece['color'])}>
                    <option value="red">Rojo</option>
                    <option value="blue">Azul</option>
                    <option value="yellow">Amarillo</option>
                    <option value="green">Verde</option>
                  </select>
                </label>
                <label>
                  Progreso
                  <input type="number" min="-1" max="71" value={debugProgress} onChange={(event) => setDebugProgress(Number(event.target.value))} />
                </label>
                <button type="button" onClick={() => simulateMove(Math.min(71, Math.max(1, debugProgress + 7)))}>Mover +7</button>
                <button type="button" onClick={() => {
                  const piece: GamePiece = { id: `${debugColor}-debug`, color: debugColor, progress: -1 }
                  if (displayedStateRef.current) replaceDisplayedState({ ...displayedStateRef.current, pieces: [...displayedStateRef.current.pieces.filter((item) => !item.id.includes('-debug')), piece] })
                  simulateEvent([{ type: 'exit', pieceId: piece.id }])
                }}>Salida</button>
                <button type="button" onClick={() => {
                  const piece: GamePiece = { id: `${debugColor}-debug`, color: debugColor, progress: 64 }
                  if (displayedStateRef.current) replaceDisplayedState({ ...displayedStateRef.current, pieces: [...displayedStateRef.current.pieces.filter((item) => !item.id.includes('-debug')), piece] })
                  simulateEvent([{ type: 'move', pieceId: piece.id, from: 64, to: 71 }, { type: 'goal', pieceId: piece.id }])
                }}>Meta</button>
                <button type="button" onClick={() => {
                  const piece: GamePiece = { id: `${debugColor}-debug`, color: debugColor, progress: 10 }
                  const victim: GamePiece = { id: 'yellow-debug-victim', color: debugColor === 'yellow' ? 'red' : 'yellow', progress: 10 }
                  if (displayedStateRef.current) replaceDisplayedState({ ...displayedStateRef.current, pieces: [...displayedStateRef.current.pieces.filter((item) => !item.id.includes('-debug')), piece, victim] })
                  simulateEvent([{ type: 'capture', pieceId: piece.id, capturedPieceIds: [victim.id] }])
                }}>Captura</button>
                <button type="button" onClick={() => {
                  const piece: GamePiece = { id: `${debugColor}-debug`, color: debugColor, progress: 12 }
                  if (displayedStateRef.current) replaceDisplayedState({ ...displayedStateRef.current, pieces: [...displayedStateRef.current.pieces.filter((item) => !item.id.includes('-debug')), piece] })
                  simulateEvent([{ type: 'penalty', color: debugColor, pieceId: piece.id }])
                }}>3 seises</button>
              </div>
            )}
          </div>

          <div className="turn-controls">
            <button
              className="die-button"
              type="button"
              onClick={rollDie}
              disabled={!canRoll}
              aria-label={`Dado: ${rolledValue ?? 'sin lanzar'}. ${dieButtonText}`}
            >
              <span className={`die die-${rolledValue ?? 0}`}>
                {Array.from({ length: 9 }).map((_, index) => (
                  <i key={index} />
                ))}
              </span>
              <span>
                <small>{dieButtonDetail}</small>
                {dieButtonText}
              </span>
            </button>
          </div>
        </div>
      </section>

      {countdown && phase === 'countdown' && (
        <div className="countdown-overlay" aria-live="assertive">
          <strong>{countdown.message}</strong>
        </div>
      )}

      {toastMessage && <div className="animation-toast" role="status">{toastMessage}</div>}
      {animating && bonusBanner && (
        <div className="bonus-banner">Bonus +{bonusBanner.amount}: elige una ficha</div>
      )}

      {gameOver && (
        <div className="game-over-overlay" role="dialog" aria-modal="true">
          <div className="game-over-card">
            <h2>🎉 ¡Felicitaciones, {gameOver.winner.name}!</h2>
            <p>{gameOver.winner.name === playerName ? '¡Ganaste la partida!' : `${gameOver.winner.name} ganó la partida`}</p>
            {gameOver.reason === 'abandonment' && <p>Los demás jugadores abandonaron la partida</p>}
            <button type="button" onClick={leaveRoom}>Volver al lobby</button>
          </div>
        </div>
      )}

      <div className="interaction-bar">
        <button className={micOn ? 'control-button' : 'control-button off'} type="button" onClick={() => setMicOn((value) => !value)} aria-label={micOn ? 'Silenciar micrófono' : 'Activar micrófono'}>
          <MicIcon active={micOn} />
        </button>
        <button className={cameraOn ? 'control-button' : 'control-button off'} type="button" onClick={() => setCameraOn((value) => !value)} aria-label={cameraOn ? 'Apagar cámara' : 'Activar cámara'}>
          <CameraIcon active={cameraOn} />
        </button>
        <div className="reaction-menu" aria-label="Reacciones">
          {['👍', '👏', '😄', '🎉'].map((emoji) => (
            <button key={emoji} type="button" onClick={() => setReaction(reaction === emoji ? null : emoji)} className={reaction === emoji ? 'active' : ''}>
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}

export default GamePage
