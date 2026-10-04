import React, { useState } from 'react';
import { HonorificMatrixScreen } from '@vietlearning/mfe-knowledge';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'm3-honorifics'>('m3-honorifics');
  const [lastSelectedPair, setLastSelectedPair] = useState<string>('cháu ➔ cụ (h1)');

  return (
    <div style={{ fontFamily: '"Be Vietnam Pro", system-ui, sans-serif', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Shell Navigation */}
      <nav
        style={{
          backgroundColor: '#0F172A',
          color: '#F8FAFC',
          padding: '0.75rem 2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          borderBottom: '1px solid #334155'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2rem'
            }}
          >
            🇻🇳
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#FFFFFF' }}>
              Bé Cu Tít - Học Tiếng Việt Thông Minh
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
              Host Shell (Port 3000) • Module Federation Registry
            </div>
          </div>
        </div>

        {/* Tab buttons */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setActiveTab('overview')}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: activeTab === 'overview' ? 700 : 500,
              backgroundColor: activeTab === 'overview' ? '#334155' : 'transparent',
              color: activeTab === 'overview' ? '#FFFFFF' : '#94A3B8'
            }}
          >
            🏠 Tổng Quan Kiến Trúc
          </button>

          <button
            onClick={() => setActiveTab('m3-honorifics')}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              border: activeTab === 'm3-honorifics' ? '1px solid #F59E0B' : '1px solid transparent',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: activeTab === 'm3-honorifics' ? 800 : 500,
              backgroundColor: activeTab === 'm3-honorifics' ? '#B45309' : '#1E293B',
              color: '#FEF3C7',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <span>🏮</span>
            <span>Màn Hình M3 (mfe-knowledge)</span>
          </button>
        </div>
      </nav>

      {/* Main Container */}
      <main style={{ flex: 1 }}>
        {activeTab === 'overview' ? (
          <div style={{ padding: '2rem', maxWidth: '850px', margin: '0 auto' }}>
            <header style={{ borderBottom: '2px solid #6366F1', paddingBottom: '1rem', marginBottom: '2rem' }}>
              <h1 style={{ color: '#6366F1', margin: 0, fontSize: '1.75rem' }}>
                Học Tiếng Việt Cùng Bé Cu Tít
              </h1>
              <p style={{ color: '#64748B', marginTop: '0.5rem' }}>
                Đồ án Chuyên đề Mobile & Pervasive Computing (SE405.R11 - UIT)
              </p>
            </header>

            <section
              style={{
                backgroundColor: '#FFFFFF',
                padding: '1.5rem',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
              }}
            >
              <h3 style={{ margin: '0 0 1rem 0', color: '#1E293B' }}>
                Kiến trúc Micro Frontend Host Shell
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.6 }}>
                Host Shell đang tích hợp 6 Remote MFEs qua Module Federation và Event Bus Observer Pattern:
              </p>
              <ul style={{ fontSize: '0.9rem', color: '#334155', lineHeight: 1.8 }}>
                <li>
                  <strong>mfe-knowledge:</strong>{' '}
                  <span style={{ color: '#059669', fontWeight: 600 }}>[Đã hoàn thiện]</span> Màn hình M3
                  (Ma trận xưng hô sân đình & A6 Interpreter) và M10 (Cẩm nang văn hóa).
                </li>
                <li><strong>mfe-conversation:</strong> Voice & Chat Canvas, Roleplay (M3 FE, M1 BE)</li>
                <li><strong>mfe-speech-lab:</strong> Pitch Visualizer F0 & Phương ngữ (M5)</li>
                <li><strong>mfe-vision:</strong> Nhãn từ vựng Camera AR Quán nước gốc đa (M5 FE, M1 BE)</li>
                <li><strong>mfe-practice:</strong> Bài tập thích ứng & Ghép câu đốt tre (M4 FE, M2 BE)</li>
                <li><strong>mfe-learner:</strong> Thống kê SM-2 & Xếp lớp thích ứng (M4 FE, M2 BE)</li>
              </ul>

              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #F1F5F9' }}>
                <button
                  onClick={() => setActiveTab('m3-honorifics')}
                  style={{
                    backgroundColor: '#F59E0B',
                    color: '#000000',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0.65rem 1.25rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                  }}
                >
                  🚀 Trải Nghiệm Màn Hình M3 Ngay
                </button>
              </div>
            </section>
          </div>
        ) : (
          <div>
            {/* Integrated Remote Header indicator */}
            <div
              style={{
                backgroundColor: '#2E1065',
                color: '#E9D5FF',
                padding: '0.35rem 2rem',
                fontSize: '0.74rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span>
                🔗 <strong>Module Federation:</strong> Nạp động Remote <code>@vietlearning/mfe-knowledge</code> vào Host Shell
              </span>
              <span>Cặp đại từ gần nhất: <strong>{lastSelectedPair}</strong></span>
            </div>

            {/* Mounted MFE Knowledge Screen */}
            <HonorificMatrixScreen
              initialTheme="dark"
              onPairChange={(p) => setLastSelectedPair(`${p.speaker} ➔ ${p.listener} (${p.pairId})`)}
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
