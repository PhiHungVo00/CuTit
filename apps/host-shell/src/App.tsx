import React from 'react';

export const App: React.FC = () => {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <header style={{ borderBottom: '2px solid #6366F1', paddingBottom: '1rem', marginBottom: '2rem' }}>
        <h1 style={{ color: '#6366F1', margin: 0 }}>Học Tiếng Việt Cùng Bé Cu Tít</h1>
        <p style={{ color: '#64748B', marginTop: '0.5rem' }}>
          Đồ án Chuyên đề Mobile & Pervasive Computing (SE405.R11 - UIT)
        </p>
      </header>

      <section style={{ backgroundColor: '#F8FAFC', padding: '1.5rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
        <h3>Kiến trúc Micro Frontend Host Shell</h3>
        <p>Host Shell đang tích hợp 6 Remote MFEs qua Module Federation:</p>
        <ul>
          <li><strong>mfe-conversation:</strong> Voice & Chat Canvas, Roleplay (M3 FE, M1 BE)</li>
          <li><strong>mfe-speech-lab:</strong> Pitch Visualizer F0 & Phương ngữ (M5)</li>
          <li><strong>mfe-knowledge:</strong> Ma trận xưng hô & Cẩm nang văn hóa (M2)</li>
          <li><strong>mfe-vision:</strong> Nhãn từ vựng Camera AR (M5 FE, M1 BE)</li>
          <li><strong>mfe-practice:</strong> Bài tập thích ứng & Ghép câu đốt tre (M4 FE, M2 BE)</li>
          <li><strong>mfe-learner:</strong> Thống kê SM-2 & Xếp lớp thích ứng (M4 FE, M2 BE)</li>
        </ul>
      </section>
    </div>
  );
};
