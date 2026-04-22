import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { GlobalStateProvider } from './GlobalStateContext';
import { LevelValidator } from './LevelValidator';
import { level1Briefing } from './types';

if (import.meta.env.DEV) {
  const errors = LevelValidator.validate(level1Briefing);
  if (errors.length > 0) {
    console.error('Level Validation Errors:', errors);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalStateProvider>
      <App />
    </GlobalStateProvider>
  </StrictMode>,
);
