import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './styles/globals.css';
import './i18n'; // initialize i18next before rendering

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-white"><div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-blue-600 animate-spin" /></div>}>
      <App />
    </Suspense>
  </React.StrictMode>,
);
