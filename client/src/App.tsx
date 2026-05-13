import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import DarkGame from './pages/DarkGame';
import BrightGame from './pages/BrightGame';
import Settings from './pages/Settings';
import OnlineLobby from './pages/OnlineLobby';
import OnlineBrightGame from './pages/OnlineBrightGame';
import OnlineDarkGame from './pages/OnlineDarkGame';
import Admin from './pages/Admin';

const routerBasename = import.meta.env.VITE_BASE_PATH?.replace(/\/$/, '') || '/';

function App() {
  return (
    <BrowserRouter basename={routerBasename}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/game/dark" element={<DarkGame />} />
        <Route path="/game/bright" element={<BrightGame />} />
        <Route path="/online/lobby" element={<OnlineLobby />} />
        <Route path="/online/game/bright/:roomId" element={<OnlineBrightGame />} />
        <Route path="/online/game/dark/:roomId" element={<OnlineDarkGame />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
