import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import DailyOpenLab from './pages/DailyOpenLab';
import './index.css';

/** Hash routing, because two surfaces do not justify a router. #/artboard is the concept lab. */
function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.startsWith('#/artboard') ? <DailyOpenLab /> : <App />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
