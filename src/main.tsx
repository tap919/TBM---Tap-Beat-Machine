import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './contexts/ThemeContext';
import { TBMAudioProvider } from './contexts/TBMAudioContext';
import { MidiProvider } from './contexts/MidiContext';
import { ErrorBoundary } from './components/ErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');
createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary componentName="TBM Root">
      <ThemeProvider>
        <TBMAudioProvider>
          <MidiProvider>
            <App />
          </MidiProvider>
        </TBMAudioProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
