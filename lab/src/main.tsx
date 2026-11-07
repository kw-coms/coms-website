import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import { App } from './App';
import { ErrorBoundary } from './ui/components/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback="앱을 표시할 수 없어요. 페이지를 새로고침해 주세요. 저장된 작업은 브라우저에 남아 있어요."><App /></ErrorBoundary>
  </StrictMode>,
);

if (import.meta.env.DEV) void import('./ui/debug');
