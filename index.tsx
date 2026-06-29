import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { clinicService } from './services/clinicService';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500">
    正在加载诊所数据...
  </div>
);

clinicService.initialize().finally(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
