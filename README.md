# Parchís Web

Aplicación web de Parchís para 2, 3 o 4 jugadores. Incluye lobby, juego en tiempo real con estado autoritativo en el backend y videollamadas mediante el SFU MeetSpace del Grupo B.

El estado de salas y partidas se conserva en memoria: no hay base de datos ni persistencia después de reiniciar el backend del juego.

## Componentes

- `frontend/`: React, TypeScript, Vite, Zustand, Framer Motion, Socket.IO Client y mediasoup-client.
- `backend/`: NestJS y Socket.IO; gestiona salas, reglas y partidas.
- `SFU/backend/`: servicio MeetSpace con mediasoup 3 y Socket.IO, independiente del backend del juego.

El código del juego permanece en `backend/` y `frontend/`; el SFU se ejecuta por separado desde `SFU/backend/`.

## Requisitos

- Node.js compatible con las dependencias de cada paquete (se recomienda Node 22 o superior).
- npm.
- Cámara y micrófono para probar audio/video. Los permisos se solicitan al activar cada control.

## Instalación

Instala cada paquete en su propio directorio:

```powershell
cd backend
npm install
cd ..\frontend
npm install
cd ..\SFU\backend
npm install
```

Configura el SFU:

```powershell
Copy-Item .env.example .env
```

En `SFU/backend/.env`, configura:

```env
PORT=4000
MEDIASOUP_ANNOUNCED_ADDRESS=127.0.0.1
```

Usa `127.0.0.1` si navegador, juego y SFU se prueban en el mismo equipo. Para clientes en otros equipos de la red, reemplázalo por la IP LAN del equipo que ejecuta el SFU. No publiques el archivo `.env`.

## Arranque local

Arranca cada componente en su propia terminal.

**1. Backend del juego** — desde `backend/`:

```powershell
npm run start:dev
```

Socket.IO en el puerto `3000`.

**2. SFU MeetSpace** — desde `SFU/backend/`:

```powershell
npm start
```

Señalización Socket.IO y health check en el puerto `4000`; health check en `http://localhost:4000/api/health`.

**3. Frontend** — desde `frontend/`:

```powershell
npm run dev -- --host
```

Vite normalmente sirve la página en `http://localhost:5173`.

### Puertos

| Puerto | Uso |
|---|---|
| 3000/TCP | Backend del juego y Socket.IO |
| 4000/TCP | SFU MeetSpace, Socket.IO y `/api/health` |
| 40000–40099/UDP y TCP | Medios WebRTC de mediasoup |
| 5173/TCP | Servidor de desarrollo Vite |

## Variables de entorno del frontend

Se pueden definir en `frontend/.env.local`:

```env
VITE_BACKEND_URL=http://localhost:3000
VITE_SFU_URL=http://localhost:4000
```

`VITE_SFU_URL` tiene por defecto `http://localhost:4000`. Para probar la interfaz de llamada sin iniciar MeetSpace:

```env
VITE_SFU_MOCK=true
```

El modo simulado muestra streams de video generados localmente; no transmite audio/video real. `VITE_USE_MOCK=true` es otro modo, independiente, que simula el servidor de salas/juego.

## Videollamada y contrato

La llamada se une usando el `roomId` del juego. El campo `participant` del protocolo del Grupo B es una cadena, así que se envía como `color|id|nombre`; no se cambió la forma de `join-room`. El color determina la esquina a la que se asocia cada stream.

Los botones de cámara y micrófono comienzan apagados. Al activarlos, la página solicita el permiso correspondiente. Si el SFU está desconectado o se deniega un permiso, se informa al usuario y el juego sigue funcionando.

Contrato confirmado leyendo el servidor: [docs/sfu-contrato.md](./docs/sfu-contrato.md). Cambio aditivo del backend SFU para cerrar producers al apagar dispositivos: [docs/cambios-sfu.md](./docs/cambios-sfu.md).

## Pruebas y builds

Frontend:

```powershell
cd frontend
npm test
npm run build
```

Backend del juego:

```powershell
cd backend
npm test
npm run build
```

Modo de depuración del tablero: `http://localhost:5173/sala/<id>?debug=1`.

## Estructura

```text
.
├── backend/       # Juego y salas
├── frontend/      # Interfaz, cliente de juego y cliente aislado del SFU
├── SFU/backend/   # MeetSpace / mediasoup
├── docs/          # Contrato e integración del SFU
└── README.md
```

## Paquetes npm en la raíz

El `package.json` y `package-lock.json` de la raíz solo se usaban para Vitest; no tienen scripts para arrancar los tres servicios. Vitest ya está declarado en `frontend/package.json`, por lo que esos manifiestos raíz y el `node_modules/` raíz no son necesarios para instalar, probar ni ejecutar el proyecto. Se recomienda retirarlos en una limpieza posterior; por ahora se conservan.

## Alcance

El SFU es exclusivamente para pruebas locales. Nginx, HTTPS/WSS, firewall y despliegue en Debian quedan fuera de esta integración.
