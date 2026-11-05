# Parchís Web

Aplicación web de **Parchís para 2, 3 o 4 jugadores**, desarrollada como proyecto universitario con React, TypeScript, Vite, NestJS y Socket.IO.

El servidor conserva el estado de las salas y de las partidas en memoria. No utiliza base de datos ni almacena partidas después de reiniciar el backend.

## Estado de videollamadas

> Esta versión **no incluye un sistema SFU ni videollamada funcional**.

Las esquinas de la interfaz muestran recuadros de cámara como interfaz preparada para una futura integración con el SFU, pero no capturan ni transmiten audio o vídeo. Los recuadros pueden integrarse posteriormente sin modificar las reglas ni el diseño del tablero.

## Funcionalidades

- Lobby con listado, creación y unión a salas.
- Partidas de 2, 3 o 4 jugadores.
- Tablero SVG de 19 × 19.
- Estado del juego validado por el backend.
- Dados, movimientos, turnos, capturas, salida, meta, bonus y castigo por tres seises.
- Animaciones de movimiento, captura, vuelo a casa, meta y castigo.
- Cuenta regresiva antes de comenzar.
- Salida de salas en espera, cuenta regresiva, partida y victoria.
- Cuatro posiciones de cámara fijas por color.
- Vista de depuración en `?debug=1`.

## Tecnologías

### Frontend

- React
- TypeScript
- Vite
- Zustand
- Socket.IO Client
- Framer Motion

### Backend

- NestJS
- Socket.IO
- WebSocket Gateway
- Estado en memoria mediante `Map`

## Requisitos

- Node.js 20 o superior.
- npm.

## Instalación

Desde la raíz del proyecto:

```powershell
cd frontend
npm install
cd ..\backend
npm install
cd ..
```

## Ejecución local

### Backend

```powershell
cd backend
npm run start:dev
```

El backend estará disponible en `http://localhost:3000`.

### Frontend

En otra terminal:

```powershell
cd frontend
npm run dev -- --host
```

El frontend normalmente estará disponible en `http://localhost:5173`.

## Configuración del frontend

Por defecto, el cliente se conecta a `http://localhost:3000`.

Para utilizar otra URL del backend, crea `frontend/.env.local`:

```env
VITE_BACKEND_URL=http://localhost:3000
```

También puede habilitarse el servidor local simulado:

```env
VITE_USE_MOCK=true
```

## Estructura

```text
.
├── frontend/
│   ├── src/
│   │   ├── pages/       # Lobby, creación de sala y partida
│   │   ├── services/    # Socket.IO y servidor mock
│   │   ├── store/       # Estado de sala con Zustand
│   │   └── types/       # Tipos compartidos del cliente
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── rooms/       # Salas, jugadores y ocupación
│   │   └── game/        # Reglas, estado y WebSocket
│   └── package.json
└── README.md
```

## Pruebas y construcción

### Frontend

```powershell
cd frontend
npm test
npm run build
```

### Backend

```powershell
cd backend
npm test
npm run build
```

## Modo de depuración

Abre el tablero con:

```text
http://localhost:5173/sala/<id-de-sala>?debug=1
```

Este modo permite probar movimientos, salida, captura, llegada a meta y castigo sin completar una partida.

## Limitaciones actuales

- No hay base de datos; las salas y partidas se pierden al reiniciar el backend.
- No hay persistencia, autenticación ni cuentas de usuario.
- No existe integración WebRTC ni SFU.
- Los controles de cámara y micrófono son visuales hasta que se integre el sistema externo.
- El protocolo y la señalización del SFU deberán acordarse posteriormente con el Grupo B.

## Despliegue previsto

El despliegue local previsto consiste en:

- Frontend servido por Nginx desde `frontend/dist`.
- Backend NestJS ejecutado con systemd o PM2.
- Socket.IO servido detrás del proxy WebSocket de Nginx.
- HTTPS local para permitir acceso a cámara y micrófono en navegadores.
