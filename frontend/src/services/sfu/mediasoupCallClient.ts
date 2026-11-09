import { Device } from 'mediasoup-client'
import type { types as MediasoupTypes } from 'mediasoup-client'
import { io, type Socket } from 'socket.io-client'
import type { BoardColor } from '../../pages/GamePage/board-mapping'
import {
  decodeParticipant,
  encodeParticipant,
  type CallClient,
  type CallEvents,
  type CallParticipant,
  type CallReaction,
  type CallState,
} from './types'

type Transport = MediasoupTypes.Transport
type Producer = MediasoupTypes.Producer
type Consumer = MediasoupTypes.Consumer

type RoomParticipant = { socketId: string; participant: string }
type ProducerInfo = { producerId: string; socketId: string; participant: string; kind: 'audio' | 'video' }
type RouterCapabilitiesResponse = { rtpCapabilities: MediasoupTypes.RtpCapabilities }
type TransportResponse = {
  id: string
  iceParameters: MediasoupTypes.IceParameters
  iceCandidates: MediasoupTypes.IceCandidate[]
  dtlsParameters: MediasoupTypes.DtlsParameters
}
type ConsumerResponse = {
  id: string
  producerId: string
  kind: 'audio' | 'video'
  rtpParameters: MediasoupTypes.RtpParameters
}
type RemoteConsumer = {
  consumer: Consumer
  producerId: string
  socketId: string
  participantId: string
  kind: 'audio' | 'video'
}

const SFU_URL = import.meta.env.VITE_SFU_URL?.trim() || 'http://localhost:4000'
const ACK_TIMEOUT_MS = 10_000
const JOIN_TIMEOUT_MS = 12_000

export class MediasoupCallClient implements CallClient {
  private socket: Socket | null = null
  private roomId: string | null = null
  private me: { id: string; name: string; color: BoardColor } | null = null
  private device: Device | null = null
  private sendTransport: Transport | null = null
  private receiveTransport: Transport | null = null
  private readonly producers = new Map<'audio' | 'video', Producer>()
  private readonly localTracks = new Map<'audio' | 'video', MediaStreamTrack>()
  private readonly remoteConsumers = new Map<string, RemoteConsumer>()
  private readonly consumedProducerIds = new Set<string>()
  private readonly participants = new Map<string, CallParticipant>()
  private readonly socketParticipantIds = new Map<string, string>()
  private readonly listeners = new Map<keyof CallEvents, Set<(payload: never) => void>>()
  private state: CallState = 'idle'
  private generation = 0
  private initializedSocketId: string | null = null
  private initializing: Promise<void> | null = null
  private joinPromise: Promise<void> | null = null
  private resolveInitialJoin: (() => void) | null = null
  private rejectInitialJoin: ((error: Error) => void) | null = null
  private joinTimeout: number | null = null

  join(roomId: string, me: { id: string; name: string; color: BoardColor }): Promise<void> {
    if (this.roomId === roomId && this.me?.id === me.id && this.socket) {
      return this.joinPromise ?? Promise.resolve()
    }

    this.leave()
    this.roomId = roomId
    this.me = me
    const generation = ++this.generation
    const socket = io(SFU_URL, { autoConnect: false, reconnection: true })
    this.socket = socket
    this.setState('connecting', 'Conectando la llamada…')
    this.installSocketHandlers(socket, generation)

    this.joinPromise = new Promise<void>((resolve, reject) => {
      this.resolveInitialJoin = resolve
      this.rejectInitialJoin = reject
      this.joinTimeout = window.setTimeout(() => {
        const error = new Error('No se pudo conectar con el servidor de videollamadas.')
        this.setState('unavailable', error.message)
        this.emit('error', error)
        this.rejectInitialJoin?.(error)
        this.resolveInitialJoin = null
        this.rejectInitialJoin = null
        this.joinTimeout = null
      }, JOIN_TIMEOUT_MS)
    })
    socket.connect()
    return this.joinPromise
  }

  leave(): void {
    this.generation += 1
    if (this.joinTimeout !== null) window.clearTimeout(this.joinTimeout)
    this.joinTimeout = null
    this.rejectInitialJoin = null
    this.resolveInitialJoin = null
    this.joinPromise = null
    this.initializing = null

    const socket = this.socket
    if (socket?.connected) socket.emit('leave-room')
    this.closeMediaResources(true)
    socket?.removeAllListeners()
    socket?.disconnect()
    this.socket = null
    this.roomId = null
    this.me = null
    this.initializedSocketId = null
    this.participants.clear()
    this.socketParticipantIds.clear()
    this.publishParticipants()
    this.setState('idle')
  }

  async toggleMic(): Promise<void> {
    await this.toggleTrack('audio')
  }

  async toggleCamera(): Promise<void> {
    await this.toggleTrack('video')
  }

  sendReaction(type: string): void {
    if (!this.socket?.connected || this.state !== 'joined') {
      this.emit('error', new Error('La llamada no está conectada; no se pudo enviar la reacción.'))
      return
    }
    this.socket.emit('send-reaction', { reaction: type })
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

  private installSocketHandlers(socket: Socket, generation: number): void {
    socket.on('connect', () => {
      if (generation !== this.generation || socket.id === this.initializedSocketId || this.initializing) return
      const initialization = this.initializeSession(socket, generation)
      this.initializing = initialization
      void initialization
        .then(() => {
          if (generation !== this.generation) return
          this.initializedSocketId = socket.id ?? null
          this.setState('joined')
          if (this.joinTimeout !== null) window.clearTimeout(this.joinTimeout)
          this.joinTimeout = null
          this.resolveInitialJoin?.()
          this.resolveInitialJoin = null
          this.rejectInitialJoin = null
        })
        .catch((cause: unknown) => {
          if (generation !== this.generation) return
          const error = cause instanceof Error ? cause : new Error(String(cause))
          this.setState('unavailable', error.message)
          this.emit('error', error)
          this.rejectInitialJoin?.(error)
          this.rejectInitialJoin = null
        })
        .finally(() => {
          if (this.initializing === initialization) this.initializing = null
        })
    })

    socket.on('disconnect', () => {
      if (generation !== this.generation) return
      this.initializedSocketId = null
      this.initializing = null
      this.closeMediaResources(false)
      this.retainLocalParticipant()
      this.setState('disconnected', 'Se perdió la conexión de videollamada. Reintentando…')
    })

    socket.on('connect_error', (cause: Error) => {
      if (generation !== this.generation) return
      const error = new Error(`El servidor de videollamadas no está disponible: ${cause.message}`)
      this.setState('unavailable', error.message)
      this.emit('error', error)
    })

    socket.on('room-error', (payload: { message?: string }) => {
      this.emit('error', new Error(payload?.message ?? 'El servidor rechazó la entrada a la sala de llamada.'))
    })

    socket.on('participant-joined', (payload: RoomParticipant) => {
      this.upsertParticipant(payload.participant, payload.socketId)
    })

    socket.on('participant-left', (payload: RoomParticipant) => {
      this.removeParticipant(payload.socketId)
    })

    socket.on('new-producer', (producer: ProducerInfo) => {
      void this.consumeProducer(producer)
    })

    socket.on('producer-closed', (payload: { producerId: string; consumerId: string }) => {
      this.removeConsumer(payload.consumerId, payload.producerId)
    })

    socket.on('reaction-received', (payload: { socketId: string; participant: string; reaction: string }) => {
      const resolved = this.resolveIdentity(payload.participant, payload.socketId)
      if (!resolved) return
      const reaction: CallReaction = { ...resolved, type: payload.reaction }
      this.emit('reaction', reaction)
    })
  }

  private async initializeSession(socket: Socket, generation: number): Promise<void> {
    this.ensureActive(socket, generation)
    this.closeMediaResources(false)
    this.retainLocalParticipant()

    const participant = this.me
    const roomId = this.roomId
    if (!participant || !roomId) throw new Error('Falta la identidad o la sala de llamada.')

    const roomJoined = await new Promise<{ participants: RoomParticipant[] }>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup()
        reject(new Error('El servidor no confirmó la entrada a la sala de llamada.'))
      }, ACK_TIMEOUT_MS)
      const onJoined = (payload: { room: string; participants: RoomParticipant[] }) => {
        if (payload.room !== roomId) return
        cleanup()
        resolve(payload)
      }
      const onError = (payload: { message?: string }) => {
        cleanup()
        reject(new Error(payload.message ?? 'El servidor rechazó la entrada a la sala de llamada.'))
      }
      const cleanup = () => {
        window.clearTimeout(timeout)
        socket.off('room-joined', onJoined)
        socket.off('room-error', onError)
      }
      socket.on('room-joined', onJoined)
      socket.on('room-error', onError)
      socket.emit('join-room', {
        room: roomId,
        participant: encodeParticipant(participant),
      })
    })

    this.ensureActive(socket, generation)
    this.participants.clear()
    this.socketParticipantIds.clear()
    for (const peer of roomJoined.participants) this.upsertParticipant(peer.participant, peer.socketId)
    this.ensureLocalParticipant(socket.id ?? '')

    const { rtpCapabilities } = await this.request<RouterCapabilitiesResponse>('getRouterRtpCapabilities')
    this.ensureActive(socket, generation)
    const device = new Device()
    await device.load({ routerRtpCapabilities: rtpCapabilities })
    this.device = device

    const [sendOptions, receiveOptions] = await Promise.all([
      this.request<TransportResponse>('createWebRtcTransport'),
      this.request<TransportResponse>('createWebRtcTransport'),
    ])
    this.ensureActive(socket, generation)

    this.sendTransport = device.createSendTransport(sendOptions)
    this.receiveTransport = device.createRecvTransport(receiveOptions)
    this.installTransportHandlers(this.sendTransport, true)
    this.installTransportHandlers(this.receiveTransport, false)

    for (const track of this.localTracks.values()) await this.produceTrack(track)

    const { producers } = await this.request<{ producers: ProducerInfo[] }>('getProducers')
    this.ensureActive(socket, generation)
    await Promise.all(producers.map((producer) => this.consumeProducer(producer)))
    this.publishParticipants()
  }

  private installTransportHandlers(transport: Transport, sending: boolean): void {
    transport.on('connect', ({ dtlsParameters }, callback, errback) => {
      void this.request('connectTransport', { transportId: transport.id, dtlsParameters })
        .then(() => callback())
        .catch((error: unknown) => errback(error instanceof Error ? error : new Error(String(error))))
    })

    if (sending) {
      transport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
        void this.request<{ id: string }>('produce', {
          transportId: transport.id,
          kind,
          rtpParameters,
        })
          .then(callback)
          .catch((error: unknown) => errback(error instanceof Error ? error : new Error(String(error))))
      })
    }

    transport.on('connectionstatechange', (state) => {
      if (state === 'failed' || state === 'disconnected') {
        this.setState('unavailable', 'La conexión multimedia se interrumpió.')
      }
    })
  }

  private async toggleTrack(kind: 'audio' | 'video'): Promise<void> {
    if (this.producers.has(kind)) {
      await this.closeLocalTrack(kind)
      return
    }
    if (!this.sendTransport || (this.state !== 'joined' && this.state !== 'permission-denied')) {
      throw new Error('La llamada no está conectada. La partida puede continuar sin videollamada.')
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Este navegador no permite acceder a los dispositivos de audio o video.')
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: kind === 'audio',
        video: kind === 'video',
      })
    } catch {
      const deviceName = kind === 'audio' ? 'micrófono' : 'cámara'
      const error = new Error(`Sin permiso para acceder al ${deviceName}. La partida sigue funcionando.`)
      this.setState('permission-denied', error.message)
      this.emit('error', error)
      throw error
    }

    const track = kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0]
    for (const extraTrack of stream.getTracks()) {
      if (extraTrack !== track) extraTrack.stop()
    }
    if (!track) throw new Error(`No se pudo obtener una pista de ${kind === 'audio' ? 'audio' : 'video'}.`)
    this.localTracks.set(kind, track)
    try {
      await this.produceTrack(track)
    } catch (cause) {
      this.closeLocalTrack(kind)
      throw cause
    }
    this.ensureLocalParticipant(this.socket?.id ?? '')
  }

  private async produceTrack(track: MediaStreamTrack): Promise<void> {
    const transport = this.sendTransport
    const participant = this.me
    if (!transport || !participant) throw new Error('El transporte de envío no está listo.')
    const producer = await transport.produce({
      track,
      appData: { participantId: participant.id, color: participant.color },
    })
    const kind = track.kind === 'audio' ? 'audio' : 'video'
    this.producers.set(kind, producer)
    producer.on('trackended', () => {
      void this.closeLocalTrack(kind).catch((error: unknown) => {
        this.emit('error', error instanceof Error ? error : new Error(String(error)))
      })
    })
    if (this.state === 'permission-denied') this.setState('joined')
    this.ensureLocalParticipant(this.socket?.id ?? '')
  }

  private async closeLocalTrack(kind: 'audio' | 'video'): Promise<void> {
    const producer = this.producers.get(kind)
    const serverClose = producer && this.socket?.connected
      ? this.request<{ closed: boolean }>('closeProducer', { producerId: producer.id })
      : null
    producer?.close()
    this.producers.delete(kind)
    const track = this.localTracks.get(kind)
    track?.stop()
    this.localTracks.delete(kind)
    this.ensureLocalParticipant(this.socket?.id ?? '')
    if (serverClose) {
      const result = await serverClose
      if (!result.closed) throw new Error('El servidor no encontró la pista para apagarla.')
    }
  }

  private async consumeProducer(info: ProducerInfo): Promise<void> {
    if (!this.receiveTransport || !this.device || this.consumedProducerIds.has(info.producerId)) return
    const identity = this.resolveIdentity(info.participant, info.socketId)
    if (!identity || info.socketId === this.socket?.id) return
    this.consumedProducerIds.add(info.producerId)
    try {
      const response = await this.request<ConsumerResponse>('consume', {
        transportId: this.receiveTransport.id,
        producerId: info.producerId,
        rtpCapabilities: this.device.recvRtpCapabilities,
      })
      const consumer = await this.receiveTransport.consume({
        id: response.id,
        producerId: response.producerId,
        kind: response.kind,
        rtpParameters: response.rtpParameters,
        appData: { participantId: identity.id, color: identity.color },
      })
      this.remoteConsumers.set(consumer.id, {
        consumer,
        producerId: info.producerId,
        socketId: info.socketId,
        participantId: identity.id,
        kind: info.kind,
      })
      const participant = this.participants.get(identity.id)
      if (!participant) return
      participant.stream.addTrack(consumer.track)
      this.updateMediaFlags(participant)
      await this.request('resumeConsumer', { consumerId: consumer.id })
      this.publishParticipants()
    } catch (cause) {
      this.consumedProducerIds.delete(info.producerId)
      const error = cause instanceof Error ? cause : new Error(String(cause))
      this.emit('error', error)
    }
  }

  private upsertParticipant(serialized: string, socketId: string): void {
    const identity = this.resolveIdentity(serialized, socketId)
    if (!identity) return
    let participant = this.participants.get(identity.id)
    if (!participant) {
      participant = {
        ...identity,
        micOn: false,
        camOn: false,
        stream: new MediaStream(),
        isLocal: socketId === this.socket?.id,
      }
      this.participants.set(identity.id, participant)
    }
    this.socketParticipantIds.set(socketId, identity.id)
    this.publishParticipants()
  }

  private ensureLocalParticipant(socketId: string): void {
    const me = this.me
    if (!me) return
    let participant = this.participants.get(me.id)
    if (!participant) {
      participant = { ...me, micOn: false, camOn: false, stream: new MediaStream(), isLocal: true }
      this.participants.set(me.id, participant)
    }
    participant.isLocal = true
    participant.stream = new MediaStream([...this.localTracks.values()])
    participant.micOn = this.localTracks.has('audio')
    participant.camOn = this.localTracks.has('video')
    if (socketId) this.socketParticipantIds.set(socketId, me.id)
    this.publishParticipants()
  }

  private resolveIdentity(serialized: string, socketId: string): {
    id: string
    name: string
    color: BoardColor
  } | null {
    const identity = decodeParticipant(serialized, socketId)
    if (!identity.color) return null
    return { id: identity.id, name: identity.name, color: identity.color }
  }

  private removeParticipant(socketId: string): void {
    const participantId = this.socketParticipantIds.get(socketId)
    if (!participantId) return
    for (const [consumerId, remote] of this.remoteConsumers) {
      if (remote.socketId === socketId) this.removeConsumer(consumerId, remote.producerId)
    }
    this.participants.delete(participantId)
    this.socketParticipantIds.delete(socketId)
    this.publishParticipants()
  }

  private removeConsumer(consumerId: string, producerId: string): void {
    const remote = this.remoteConsumers.get(consumerId)
      ?? [...this.remoteConsumers.values()].find((item) => item.producerId === producerId)
    if (!remote) return
    remote.consumer.close()
    this.remoteConsumers.delete(remote.consumer.id)
    this.consumedProducerIds.delete(remote.producerId)
    const participant = this.participants.get(remote.participantId)
    const track = participant?.stream.getTracks().find((item) => item.id === remote.consumer.track.id)
    if (track) participant?.stream.removeTrack(track)
    if (participant) this.updateMediaFlags(participant)
    this.publishParticipants()
  }

  private updateMediaFlags(participant: CallParticipant): void {
    participant.micOn = participant.stream.getAudioTracks().some((track) => track.readyState === 'live')
    participant.camOn = participant.stream.getVideoTracks().some((track) => track.readyState === 'live')
  }

  private retainLocalParticipant(): void {
    this.participants.clear()
    this.socketParticipantIds.clear()
    if (this.me) this.ensureLocalParticipant('')
  }

  private closeMediaResources(stopLocalTracks: boolean): void {
    for (const remote of this.remoteConsumers.values()) remote.consumer.close()
    this.remoteConsumers.clear()
    this.consumedProducerIds.clear()
    for (const producer of this.producers.values()) producer.close()
    this.producers.clear()
    this.sendTransport?.close()
    this.receiveTransport?.close()
    this.sendTransport = null
    this.receiveTransport = null
    this.device = null
    if (stopLocalTracks) {
      for (const track of this.localTracks.values()) track.stop()
      this.localTracks.clear()
    }
  }

  private ensureActive(socket: Socket, generation: number): void {
    if (generation !== this.generation || socket !== this.socket || !socket.connected) {
      throw new Error('La sesión de videollamada cambió durante la negociación.')
    }
  }

  private request<Response>(event: string, data?: unknown): Promise<Response> {
    const socket = this.socket
    if (!socket?.connected) return Promise.reject(new Error('El socket del SFU no está conectado.'))
    return new Promise<Response>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error(`Tiempo de espera agotado para ${event}.`)), ACK_TIMEOUT_MS)
      socket.emit(event, data ?? {}, (response: Response & { error?: string }) => {
        window.clearTimeout(timeout)
        if (response?.error) reject(new Error(response.error))
        else resolve(response)
      })
    })
  }

  private publishParticipants(): void {
    const participants = [...this.participants.values()]
    this.emit('participants', participants)
    this.emit('streams', participants)
  }

  private setState(state: CallState, message?: string): void {
    this.state = state
    this.emit('state', { state, message })
  }

  private emit<Event extends keyof CallEvents>(event: Event, payload: CallEvents[Event]): void {
    for (const callback of this.listeners.get(event) ?? []) callback(payload as never)
  }
}
