import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import Home from './pages/Home';
import DarkGame from './pages/DarkGame';
import BrightGame from './pages/BrightGame';
import Settings from './pages/Settings';
import OnlineLobby from './pages/OnlineLobby';
import OnlineBrightGame from './pages/OnlineBrightGame';
import OnlineDarkGame from './pages/OnlineDarkGame';

const routerBasename = import.meta.env.VITE_BASE_PATH?.replace(/\/$/, '') || '/';

function GitHubPagesRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirectPath = params.get('redirect');

    if (!redirectPath?.startsWith('/')) {
      return;
    }

    params.delete('redirect');
    const nextSearch = params.toString();
    navigate(
      {
        pathname: redirectPath,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true },
    );
  }, [navigate]);

  return null;
}

function App() {
  return (
    <BrowserRouter basename={routerBasename}>
      <GitHubPagesRedirect />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/game/dark" element={<DarkGame />} />
        <Route path="/game/bright" element={<BrightGame />} />
        <Route path="/online/lobby" element={<OnlineLobby />} />
        <Route path="/online/game/bright/:roomId" element={<OnlineBrightGame />} />
        <Route path="/online/game/dark/:roomId" element={<OnlineDarkGame />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
