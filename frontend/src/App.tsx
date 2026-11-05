import { Navigate, Route, Routes } from 'react-router-dom'
import LobbyPage from './pages/LobbyPage/LobbyPage'
import CreateRoomPage from './pages/CreateRoomPage/CreateRoomPage'
import GamePage from './pages/GamePage/GamePage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LobbyPage />} />
      <Route path="/crear" element={<CreateRoomPage />} />
      <Route path="/sala/:roomId" element={<GamePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
