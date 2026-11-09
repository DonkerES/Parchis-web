
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "node:http";
import { Server } from "socket.io";
import * as mediasoup from "mediasoup";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT) || 3000;

const ANNOUNCED_ADDRESS =
  process.env.MEDIASOUP_ANNOUNCED_ADDRESS?.trim() || undefined;

const MEDIA_PORT_MIN = 40000;
const MEDIA_PORT_MAX = 40099;

let worker;

// rooms: nombre de sala -> { router, peers }
const rooms = new Map();

const mediaCodecs = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {
      "x-google-start-bitrate": 1000,
    },
  },
];

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "MeetSpace Mediasoup",
    mediasoupWorker: worker ? "running" : "not started",
    rooms: rooms.size,
  });
});

function replyError(callback, error) {
  const message = error instanceof Error
    ? error.message
    : String(error);

  console.error("Error de mediasoup:", message);

  if (typeof callback === "function") {
    callback({ error: message });
  }
}

function getPeer(socket) {
  const room = rooms.get(socket.data.roomName);
  const peer = room?.peers.get(socket.id);

  if (!room || !peer) {
    throw new Error("Primero debes entrar en una sala.");
  }

  return { room, peer };
}

async function getOrCreateRoom(roomName) {
  let room = rooms.get(roomName);

  if (room) return room;

  const router = await worker.createRouter({ mediaCodecs });

  room = {
    router,
    peers: new Map(),
  };

  rooms.set(roomName, room);

  console.log(`Router de mediasoup creado para: ${roomName}`);

  return room;
}

function closePeerResources(peer) {
  for (const consumer of peer.consumers.values()) {
    consumer.close();
  }

  for (const producer of peer.producers.values()) {
    producer.close();
  }

  for (const transport of peer.transports.values()) {
    transport.close();
  }

  peer.consumers.clear();
  peer.producers.clear();
  peer.transports.clear();
}

function removeParticipant(socket) {
  const roomName = socket.data.roomName;

  if (!roomName) return;

  const room = rooms.get(roomName);
  const peer = room?.peers.get(socket.id);

  if (room && peer) {
    closePeerResources(peer);
    room.peers.delete(socket.id);

    io.to(roomName).emit("participant-left", {
      socketId: socket.id,
      participant: peer.name,
    });

    if (room.peers.size === 0) {
      room.router.close();
      rooms.delete(roomName);

      console.log(`Sala eliminada: ${roomName}`);
    }
  }

  socket.leave(roomName);
  socket.data.roomName = null;
}

// Socket.IO
io.on("connection", (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  socket.emit("server-ready", {
    message: "Conexión con el servidor MeetSpace establecida",
  });

  socket.on("join-room", async ({ room, participant } = {}) => {
    try {
      if (
        typeof room !== "string" ||
        typeof participant !== "string" ||
        !room.trim() ||
        !participant.trim() ||
        room.length > 100 ||
        participant.length > 50
      ) {
        socket.emit("room-error", {
          message: "Nombre de participante o sala inválido.",
        });
        return;
      }

      removeParticipant(socket);

      const roomName = room.trim();
      const participantName = participant.trim();
      const roomData = await getOrCreateRoom(roomName);

      const existingParticipants = Array.from(
        roomData.peers,
        ([socketId, peer]) => ({
          socketId,
          participant: peer.name,
        })
      );

      roomData.peers.set(socket.id, {
        name: participantName,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
      });

      socket.join(roomName);
      socket.data.roomName = roomName;

      socket.emit("room-joined", {
        room: roomName,
        socketId: socket.id,
        participants: [
          ...existingParticipants,
          {
            socketId: socket.id,
            participant: participantName,
          },
        ],
      });

      socket.to(roomName).emit("participant-joined", {
        socketId: socket.id,
        participant: participantName,
      });

      console.log(
        `${participantName} entró en ${roomName}. ` +
        `Participantes: ${roomData.peers.size}`
      );
    } catch (error) {
      replyError((result) => {
        socket.emit("room-error", { message: result.error });
      }, error);
    }
  });

  // El navegador obtiene las capacidades de audio y vídeo
  // que admite el router de la sala.
  socket.on("getRouterRtpCapabilities", (_data, callback) => {
    try {
      const { room } = getPeer(socket);

      callback?.({
        rtpCapabilities: room.router.rtpCapabilities,
      });
    } catch (error) {
      replyError(callback, error);
    }
  });

  // Crear transporte WebRTC para enviar o recibir medios.
  socket.on("createWebRtcTransport", async (_data, callback) => {
    try {
      const { room, peer } = getPeer(socket);

      const transport = await room.router.createWebRtcTransport({
        listenInfos: [
          {
            protocol: "udp",
            ip: "0.0.0.0",
            announcedAddress: ANNOUNCED_ADDRESS,
            portRange: {
              min: MEDIA_PORT_MIN,
              max: MEDIA_PORT_MAX,
            },
          },
          {
            protocol: "tcp",
            ip: "0.0.0.0",
            announcedAddress: ANNOUNCED_ADDRESS,
            portRange: {
              min: MEDIA_PORT_MIN,
              max: MEDIA_PORT_MAX,
            },
          },
        ],
        enableSctp: false,
        initialAvailableOutgoingBitrate: 1000000,
      });

      peer.transports.set(transport.id, transport);

      transport.on("dtlsstatechange", (state) => {
        if (state === "closed") {
          transport.close();
        }
      });

      transport.on("@close", () => {
        peer.transports.delete(transport.id);
      });

      callback?.({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (error) {
      replyError(callback, error);
    }
  });

  // Completar la negociación DTLS del transporte.
  socket.on("connectTransport", async (data = {}, callback) => {
    try {
      const { peer } = getPeer(socket);
      const transport = peer.transports.get(data.transportId);

      if (!transport) {
        throw new Error("No se encontró el transporte.");
      }

      await transport.connect({
        dtlsParameters: data.dtlsParameters,
      });

      callback?.({ connected: true });
    } catch (error) {
      replyError(callback, error);
    }
  });

  // Publicar una pista de audio o vídeo.
  socket.on("produce", async (data = {}, callback) => {
    try {
      const { room, peer } = getPeer(socket);
      const transport = peer.transports.get(data.transportId);

      if (!transport) {
        throw new Error("No se encontró el transporte emisor.");
      }

      const producer = await transport.produce({
        kind: data.kind,
        rtpParameters: data.rtpParameters,
      });

      peer.producers.set(producer.id, producer);

      producer.on("transportclose", () => {
        peer.producers.delete(producer.id);
      });

      producer.on("close", () => {
        peer.producers.delete(producer.id);
      });

      // Avisar a los demás participantes que hay nuevos medios.
      socket.to(socket.data.roomName).emit("new-producer", {
        producerId: producer.id,
        socketId: socket.id,
        participant: peer.name,
        kind: producer.kind,
      });

      console.log(
        `Productor ${producer.kind} creado por ${peer.name}`
      );

      callback?.({ id: producer.id });
    } catch (error) {
      replyError(callback, error);
    }
  });

  socket.on("closeProducer", (data = {}, callback) => {
    try {
      const { peer } = getPeer(socket);
      const producer = peer.producers.get(data.producerId);

      if (!producer) {
        callback?.({ closed: false });
        return;
      }

      producer.close();
      peer.producers.delete(producer.id);
      callback?.({ closed: true });
    } catch (error) {
      replyError(callback, error);
    }
  });

  // Listar pistas publicadas por los demás participantes.
  socket.on("getProducers", (_data, callback) => {
    try {
      const { room } = getPeer(socket);
      const producers = [];

      for (const [socketId, peer] of room.peers) {
        if (socketId === socket.id) continue;

        for (const producer of peer.producers.values()) {
          producers.push({
            producerId: producer.id,
            socketId,
            participant: peer.name,
            kind: producer.kind,
          });
        }
      }

      callback?.({ producers });
    } catch (error) {
      replyError(callback, error);
    }
  });

  // Crear un consumidor para recibir una pista publicada.
  socket.on("consume", async (data = {}, callback) => {
    try {
      const { room, peer } = getPeer(socket);
      const transport = peer.transports.get(data.transportId);

      if (!transport) {
        throw new Error("No se encontró el transporte receptor.");
      }

      if (
        !room.router.canConsume({
          producerId: data.producerId,
          rtpCapabilities: data.rtpCapabilities,
        })
      ) {
        throw new Error("No se puede recibir esta pista multimedia.");
      }

      const consumer = await transport.consume({
        producerId: data.producerId,
        rtpCapabilities: data.rtpCapabilities,
        paused: true,
      });

      peer.consumers.set(consumer.id, consumer);

      consumer.on("transportclose", () => {
        peer.consumers.delete(consumer.id);
      });

      consumer.on("producerclose", () => {
        peer.consumers.delete(consumer.id);

        socket.emit("producer-closed", {
          producerId: data.producerId,
          consumerId: consumer.id,
        });
      });

      callback?.({
        id: consumer.id,
        producerId: consumer.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
        producerPaused: consumer.producerPaused,
      });
    } catch (error) {
      replyError(callback, error);
    }
  });

  // Reanudar el envío al consumidor después de configurarlo.
  socket.on("resumeConsumer", async (data = {}, callback) => {
    try {
      const { peer } = getPeer(socket);
      const consumer = peer.consumers.get(data.consumerId);

      if (!consumer) {
        throw new Error("No se encontró el consumidor.");
      }

      await consumer.resume();
      callback?.({ resumed: true });
    } catch (error) {
      replyError(callback, error);
    }
  });

  // Levantar o bajar la mano
  socket.on("toggle-hand", (data) => {
    const roomName = socket.data.roomName;
    if (!roomName) return;

    const room = rooms.get(roomName);
    const peer = room?.peers.get(socket.id);
    if (!peer) return;

    peer.handRaised = Boolean(data?.raised);

    io.to(roomName).emit("hand-updated", {
      socketId: socket.id,
      participant: peer.name,
      raised: peer.handRaised,
    });
  });

  // Enviar una reacción a los participantes
  socket.on("send-reaction", (data) => {
    const roomName = socket.data.roomName;
    if (!roomName) return;

    const allowedReactions = ["😂", "❤️", "👍", "👏", "😮", "🎉"];
    const reaction = data?.reaction;

    if (!allowedReactions.includes(reaction)) return;

    const room = rooms.get(roomName);
    const peer = room?.peers.get(socket.id);
    if (!peer) return;

    io.to(roomName).emit("reaction-received", {
      socketId: socket.id,
      participant: peer.name,
      reaction,
    });
  });

  socket.on("leave-room", () => {
    const roomName = socket.data.roomName;

    if (!roomName) return;

    removeParticipant(socket);

    socket.emit("room-left", {
      room: roomName,
      message: "Has salido de la sala.",
    });

    console.log(`Un participante salió de ${roomName}`);
  });

  socket.on("disconnect", () => {
    removeParticipant(socket);
    console.log(`Cliente desconectado: ${socket.id}`);
  });
});

async function startServer() {
  try {
    worker = await mediasoup.createWorker({
      logLevel: "warn",
    });

    worker.on("died", () => {
      console.error("El Worker de mediasoup dejó de funcionar.");
      process.exit(1);
    });

    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`Servidor MeetSpace escuchando en el puerto ${PORT}`);
      console.log(`Estado: http://localhost:${PORT}/api/health`);
      console.log(`IP multimedia anunciada: ${ANNOUNCED_ADDRESS}`);
      console.log(
        `Puertos multimedia: ${MEDIA_PORT_MIN}-${MEDIA_PORT_MAX}`
      );
    });
  } catch (error) {
    console.error("No se pudo iniciar el servidor:", error);
    process.exit(1);
  }
}

startServer();
