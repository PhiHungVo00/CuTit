import React from 'react';

export interface CuTitWisdomCardProps {
  wisdom: string;
  explanation: string;
  relationName: string;
  theme: 'dark' | 'light';
}

export const CuTitWisdomCard: React.FC<CuTitWisdomCardProps> = ({
  wisdom,
  explanation,
  relationName,
  theme
}) => {
  const isDark = theme === 'dark';

  return (
    <div
      style={{
        marginTop: '1.5rem',
        borderRadius: '16px',
        padding: '1.25rem',
        background: isDark
          ? 'linear-gradient(135deg, rgba(42, 30, 23, 0.95) 0%, rgba(56, 38, 28, 0.95) 100%)'
          : 'linear-gradient(135deg, #FFFDF9 0%, #FBF6EE 100%)',
        border: isDark ? '1px solid #B45309' : '1px solid #E5D5C0',
        boxShadow: isDark
          ? '0 8px 24px -4px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(245, 158, 11, 0.15)'
          : '0 8px 24px -4px rgba(180, 83, 9, 0.08), inset 0 1px 0 #FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        transition: 'all 0.3s ease'
      }}
    >
      {/* Header Bé Cu Tít */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          {/* Avatar Bé Cu Tít với Mũ lồng đèn ông sao */}
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: isDark
                ? 'radial-gradient(circle, #F59E0B 0%, #B45309 80%)'
                : 'radial-gradient(circle, #10B981 0%, #059669 80%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              boxShadow: isDark ? '0 0 16px rgba(245, 158, 11, 0.4)' : '0 2px 8px rgba(16, 185, 129, 0.3)',
              border: isDark ? '2px solid #FDE68A' : '2px solid #D1FAE5',
              flexShrink: 0
            }}
          >
            🏮
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '1rem',
                  color: isDark ? '#FEF3C7' : '#0F172A',
                  letterSpacing: '0.01em'
                }}
              >
                Bé Cu Tít Mách Nước Dân Gian
              </span>
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '9999px',
                  fontWeight: 700,
                  background: isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.15)',
                  color: isDark ? '#FBBF24' : '#047857',
                  border: isDark ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(16, 185, 129, 0.3)'
                }}
              >
                Sứ giả 7 tuổi
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: isDark ? '#D4B895' : '#64748B' }}>
              Quy tắc xưng hô: <strong style={{ color: isDark ? '#F59E0B' : '#059669' }}>{relationName}</strong>
            </div>
          </div>
        </div>

        <div
          style={{
            fontSize: '0.75rem',
            padding: '0.25rem 0.65rem',
            borderRadius: '8px',
            background: isDark ? '#1C140E' : '#EDE4D6',
            color: isDark ? '#FDE68A' : '#78350F',
            fontWeight: 600,
            border: isDark ? '1px solid #78350F' : '1px solid #D6C7B2'
          }}
        >
          📜 Tục lệ ngàn đời
        </div>
      </div>

      {/* Ca dao tục ngữ châm ngôn */}
      <div
        style={{
          padding: '0.85rem 1rem',
          borderRadius: '12px',
          background: isDark ? 'rgba(28, 20, 14, 0.85)' : 'rgba(255, 255, 255, 0.85)',
          borderLeft: isDark ? '4px solid #F59E0B' : '4px solid #10B981',
          border: isDark ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.65rem'
        }}
      >
        <span style={{ fontSize: '1.25rem', lineHeight: '1.2' }}>🎋</span>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: isDark ? '#FBBF24' : '#059669',
              marginBottom: '0.2rem'
            }}
          >
            Lời Dặn Xưa:
          </div>
          <div
            style={{
              fontStyle: 'italic',
              fontWeight: 600,
              fontSize: '0.92rem',
              color: isDark ? '#FFFBEB' : '#1E293B',
              lineHeight: 1.5
            }}
          >
            "{wisdom}"
          </div>
        </div>
      </div>

      {/* Giải thích chi tiết văn hóa sân đình */}
      <div
        style={{
          fontSize: '0.86rem',
          lineHeight: 1.6,
          color: isDark ? '#E2D3BE' : '#334155',
          background: isDark ? 'rgba(15, 10, 7, 0.35)' : 'rgba(240, 235, 225, 0.45)',
          padding: '0.75rem 1rem',
          borderRadius: '10px'
        }}
      >
        <strong style={{ color: isDark ? '#FDE68A' : '#0F172A' }}>Ý nghĩa văn hóa: </strong>
        {explanation}
      </div>
    </div>
  );
};
