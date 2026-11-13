import { useEffect, useState } from 'react';
import EditorPage from './EditorPage';
import ShapeLab from './ShapeLab';

function route() {
  return window.location.hash === '#/editor' ? 'editor' : 'demo';
}

export default function App() {
  const [page, setPage] = useState(route);
  useEffect(() => {
    const sync = () => setPage(route());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  return page === 'editor' ? <EditorPage /> : <ShapeLab />;
}
