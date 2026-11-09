# Contrato del SFU MeetSpace

Este contrato se documentó leyendo `SFU/backend/server.js`. En el repositorio no existe `SFU/backend/README.md`; por tanto, el servidor es la fuente verificable. No se modificó el servidor del grupo B.

## Conexión y salas

- Transporte de control: Socket.IO.
- URL usada por la página: `VITE_SFU_URL`; por defecto `http://localhost:4000`.
- `server-ready` se emite al conectar con `{ message: string }`.
- `join-room` recibe `{ room: string, participant: string }`. No utiliza callback. El servidor valida ambos como texto no vacío, con máximo 100 caracteres para `room` y 50 para `participant`.
- En esta integración, `room` es el `roomId` del juego y `participant` se serializa como `color|id|nombre`. El servidor lo conserva y retransmite como texto; este formato permite resolver el color sin cambiar el contrato ni el backend del grupo B.
- `room-joined` devuelve `{ room, socketId, participants }`. `participants` es un arreglo de `{ socketId, participant }` e incluye al participante que acaba de entrar.
- `participant-joined` notifica a los demás con `{ socketId, participant }`.
- `participant-left` notifica a los demás con `{ socketId, participant }`.
- `room-error` contiene `{ message: string }`.
- `leave-room` no requiere payload ni callback. El emisor recibe `room-left` con `{ room, message }`.
- El servidor también retira al participante al desconectarse el socket. Cierra consumers, producers y transports del participante. Cuando la sala queda vacía, cierra el router y elimina la sala.
- Al reconectar, el servidor no restaura el socket ni sus recursos anteriores: el cliente debe volver a emitir `join-room`, negociar de nuevo los transports y solicitar otra vez los producers.

## Eventos con callback

Los errores de las operaciones con callback se devuelven como `{ error: string }`.

| Cliente → servidor | Datos enviados | Respuesta de callback |
|---|---|---|
| `getRouterRtpCapabilities` | Sin datos requeridos | `{ rtpCapabilities }` |
| `createWebRtcTransport` | El servidor ignora el payload | `{ id, iceParameters, iceCandidates, dtlsParameters }` |
| `connectTransport` | `{ transportId, dtlsParameters }` | `{ connected: true }` |
| `produce` | `{ transportId, kind, rtpParameters }` | `{ id: producerId }` |
| `closeProducer` | `{ producerId }` | `{ closed: boolean }` |
| `getProducers` | Sin datos requeridos | `{ producers: [{ producerId, socketId, participant, kind }] }` |
| `consume` | `{ transportId, producerId, rtpCapabilities }` | `{ id, producerId, kind, rtpParameters, type, producerPaused }` |
| `resumeConsumer` | `{ consumerId }` | `{ resumed: true }` |

`new-producer` se emite a los demás participantes con `{ producerId, socketId, participant, kind }`.
`producer-closed` se emite al consumidor con `{ producerId, consumerId }`.

### Identidad del producer y `appData`

El dueño de una pista se identifica con `socketId`; `participant` es la cadena que ese socket envió al entrar. `getProducers` y `new-producer` incluyen los dos campos.

La app adjunta `{ participantId, color }` como `appData` local al crear el producer de mediasoup-client. El servidor actual no recibe ni guarda `appData`: su manejador `produce` solo usa `transportId`, `kind` y `rtpParameters`. El cliente resuelve el participante a partir de la cadena `participant` y conserva `appData` localmente.

## Audio y cámara

El servidor no implementa eventos separados para pausar o reanudar un producer. Para apagar un dispositivo sin sacar al participante de la sala, esta integración añade `closeProducer`:

- Al activar un dispositivo, el cliente solicita permiso con `getUserMedia` y crea el producer correspondiente.
- Al apagar, el cliente solicita `closeProducer`, cierra el producer local y detiene su pista. Los consumidores remotos reciben `producer-closed` y vuelven al avatar.
- Al volver a encender, el cliente solicita permiso de nuevo, crea una pista y un producer nuevos.
- Al salir o cerrar la llamada, el cliente emite `leave-room`, cierra los recursos locales y detiene todas las pistas.

## Reacciones y manos

- `send-reaction` recibe `{ reaction: string }`. Solo acepta `😂`, `❤️`, `👍`, `👏`, `😮` y `🎉`.
- `reaction-received` se transmite a todos los participantes, incluido el emisor: `{ socketId, participant, reaction }`.
- `toggle-hand` recibe `{ raised: boolean }`; `hand-updated` transmite `{ socketId, participant, raised }`. La página no usa estos eventos.

## Consideraciones de red

- El backend MeetSpace usa `PORT` (el valor por defecto del código es 3000; en esta instalación se configura 4000).
- `/api/health` devuelve `{ status, service, mediasoupWorker, rooms }`.
- Los transports WebRTC anuncian UDP y TCP en el rango 40000–40099.
- `MEDIASOUP_ANNOUNCED_ADDRESS` se usa para la dirección anunciada por ICE. En una prueba local en el mismo equipo se configura como `127.0.0.1`; para equipos distintos se configura con la IP LAN del equipo que ejecuta MeetSpace.
- La sala SFU se elimina al salir o desconectarse su último participante.
