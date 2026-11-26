import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { inject } from '@vercel/analytics';
if (import.meta.env.PROD) inject();
createRoot(document.getElementById('root')).render(<App />);
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {});
