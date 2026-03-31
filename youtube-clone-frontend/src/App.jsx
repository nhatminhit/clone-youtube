import { Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Header from './components/Header/Header';
import Sidebar from './components/Sidebar/Sidebar';
import Home from './pages/Home/Home';
import Search from './pages/Search/Search';
import Watch from './pages/Watch/Watch';
import Trending from './pages/Trending/Trending';
import History from './pages/History/History';
import GlobalPlayer from './components/GlobalPlayer/GlobalPlayer';
import { usePlayer } from './context/PlayerContext';
import './App.css';

function App() {
  const location = useLocation();
  const { showPlayer, toggleMiniMode } = usePlayer();

  // Auto-miniplayer: if we leave watch page, minimize it
  useEffect(() => {
    const isWatchPage = location.pathname.startsWith('/watch/');
    if (!isWatchPage && showPlayer) {
      toggleMiniMode(true);
    }
  }, [location.pathname, showPlayer, toggleMiniMode]);

  return (
    <div className="app">
      <Header />
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/watch/:id" element={<Watch />} />
          <Route path="/trending" element={<Trending />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </main>
      <GlobalPlayer />
    </div>
  );
}

export default App;
