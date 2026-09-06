import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ShapeLab from './ShapeLab';
import './base.css';
createRoot(document.getElementById('root')!).render(<StrictMode><ShapeLab /></StrictMode>);
