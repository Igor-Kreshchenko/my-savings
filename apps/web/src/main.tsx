import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element was not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <main>
      <h1>My Savings</h1>
      <p>Application scaffold</p>
    </main>
  </StrictMode>,
);
