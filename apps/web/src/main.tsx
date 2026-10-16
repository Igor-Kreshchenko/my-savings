import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { QueryProvider } from './api/query-provider.js';
import { PwaUpdatePrompt } from './pwa/PwaUpdatePrompt.js';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element was not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryProvider>
      <App />
      <PwaUpdatePrompt />
    </QueryProvider>
  </StrictMode>,
);
