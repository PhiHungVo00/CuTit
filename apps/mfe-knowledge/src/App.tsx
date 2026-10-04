import React from 'react';
import { HonorificMatrixScreen } from './components/HonorificMatrixScreen';

export const App: React.FC = () => {
  return (
    <div>
      {/* Standalone status indicator badge */}
      <div
        style={{
          backgroundColor: '#1E1B4B',
          color: '#C7D2FE',
          padding: '0.4rem 1.5rem',
          fontSize: '0.75rem',
          fontWeight: 600,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'sans-serif',
          borderBottom: '1px solid #312E81'
        }}
      >
        <span>
          ⚡ <strong>@vietlearning/mfe-knowledge</strong> • Chế độ độc lập (Standalone Mode - Port 3004)
        </span>
        <span>Màn hình M3: Ma Trận Đại Từ Xưng Hô (Sân Đình Cổ Truyền)</span>
      </div>

      <HonorificMatrixScreen initialTheme="dark" />
    </div>
  );
};

export default App;
