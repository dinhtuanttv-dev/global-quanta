import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { getMarketGateway } from './config/marketGateway';
import { installGatewayResilience } from './services/gatewayResilience';
import './styles/tailwind.css';
import './styles/tokens.css';
import './styles/App.css';

// Chịu lỗi Gateway: bản lưu cuối khi máy chủ dữ liệu gián đoạn (không thêm request lúc bình thường).
const gateway = getMarketGateway();
if (gateway.enabled) installGatewayResilience(gateway.baseUrl);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);