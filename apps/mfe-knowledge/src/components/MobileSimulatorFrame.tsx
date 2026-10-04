import React, { useState } from 'react';

export interface MobileSimulatorFrameProps {
  children: React.ReactNode;
  initialDevice?: 'iphone' | 'pixel' | 'fluid';
  currentTheme?: 'dark' | 'light';
  onThemeToggle?: () => void;
}

export const MobileSimulatorFrame: React.FC<MobileSimulatorFrameProps> = ({
  children,
  initialDevice = 'iphone',
  currentTheme = 'dark',
  onThemeToggle
}) => {
  const [device, setDevice] = useState<'iphone' | 'pixel' | 'fluid'>(initialDevice);
  const [currentTime] = useState(() => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  });

  const isDark = currentTheme === 'dark';

  // Device width mapping
  const deviceWidths = {
    iphone: '393px',
    pixel: '412px',
    fluid: '100%'
  };

  const deviceHeights = {
    iphone: '852px',
    pixel: '890px',
    fluid: 'auto'
  };

  return (
    <div
      style={{
        backgroundColor: isDark ? '#0C0A09' : '#EDE8E0',
        minHeight: '100vh',
        fontFamily: '"Be Vietnam Pro", system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: device === 'fluid' ? '0' : '1.5rem 1rem 3rem 1rem',
        boxSizing: 'border-box',
        transition: 'background-color 0.3s ease'
      }}
    >
      {/* TOP DESKTOP CONTROLLER TOOLBAR */}
      <div
        style={{
          width: '100%',
          maxWidth: '750px',
          backgroundColor: isDark ? '#1C1917' : '#FFFFFF',
          borderRadius: '16px',
          padding: '0.65rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '1.5rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          border: isDark ? '1px solid #292524' : '1px solid #E7E5E4',
          zIndex: 40
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#F59E0B',
              color: '#000000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1rem'
            }}
          >
            📱
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.88rem', color: isDark ? '#F5F5F4' : '#1C1917' }}>
              Trình Giả Lập Điện Thoại Di Động (Mobile Simulator)
            </div>
            <div style={{ fontSize: '0.72rem', color: isDark ? '#A8A29E' : '#78716C' }}>
              Viewport Chuẩn Stitch: {device === 'iphone' ? 'iPhone 15 Pro (393 × 852px)' : device === 'pixel' ? 'Google Pixel 8 (412 × 890px)' : 'Toàn màn hình'}
            </div>
          </div>
        </div>

        {/* Device Switcher Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button
            onClick={() => setDevice('iphone')}
            style={{
              padding: '0.35rem 0.65rem',
              borderRadius: '8px',
              border: device === 'iphone' ? '1.5px solid #F59E0B' : '1px solid transparent',
              backgroundColor: device === 'iphone' ? (isDark ? '#292524' : '#FEF3C7') : 'transparent',
              color: device === 'iphone' ? (isDark ? '#F59E0B' : '#B45309') : (isDark ? '#A8A29E' : '#57534E'),
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}
          >
            <span>🍎</span> iPhone 15
          </button>

          <button
            onClick={() => setDevice('pixel')}
            style={{
              padding: '0.35rem 0.65rem',
              borderRadius: '8px',
              border: device === 'pixel' ? '1.5px solid #F59E0B' : '1px solid transparent',
              backgroundColor: device === 'pixel' ? (isDark ? '#292524' : '#FEF3C7') : 'transparent',
              color: device === 'pixel' ? (isDark ? '#F59E0B' : '#B45309') : (isDark ? '#A8A29E' : '#57534E'),
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}
          >
            <span>🤖</span> Pixel 8
          </button>

          <button
            onClick={() => setDevice('fluid')}
            style={{
              padding: '0.35rem 0.65rem',
              borderRadius: '8px',
              border: device === 'fluid' ? '1.5px solid #F59E0B' : '1px solid transparent',
              backgroundColor: device === 'fluid' ? (isDark ? '#292524' : '#FEF3C7') : 'transparent',
              color: device === 'fluid' ? (isDark ? '#F59E0B' : '#B45309') : (isDark ? '#A8A29E' : '#57534E'),
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}
          >
            <span>🖥️</span> Tràn viền
          </button>

          {onThemeToggle && (
            <button
              onClick={onThemeToggle}
              title="Đổi màu giao diện Dark/Light"
              style={{
                marginLeft: '0.25rem',
                padding: '0.35rem 0.6rem',
                borderRadius: '8px',
                border: isDark ? '1px solid #44403C' : '1px solid #D6D3D1',
                backgroundColor: isDark ? '#292524' : '#F5F5F4',
                color: isDark ? '#F59E0B' : '#B45309',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              {isDark ? '☀️ Sáng' : '🌙 Tối'}
            </button>
          )}
        </div>
      </div>

      {/* PHONE DEVICE CHASSIS (OR FLUID CONTAINER) */}
      {device === 'fluid' ? (
        <div style={{ width: '100%', minHeight: '100vh' }}>{children}</div>
      ) : (
        <div
          style={{
            position: 'relative',
            width: deviceWidths[device],
            height: deviceHeights[device],
            borderRadius: '52px',
            backgroundColor: isDark ? '#1C1917' : '#FFFFFF',
            boxShadow: isDark
              ? '0 25px 80px -15px rgba(0, 0, 0, 0.9), 0 0 0 12px #26211D, 0 0 0 14px #3E342B'
              : '0 25px 70px -15px rgba(120, 53, 15, 0.25), 0 0 0 12px #3E2F23, 0 0 0 14px #66503E',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            transition: 'width 0.3s ease, height 0.3s ease'
          }}
        >
          {/* PHONE STATUS BAR (TOP) */}
          <div
            style={{
              height: '44px',
              padding: '0 1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: isDark ? '#16100B' : '#F6F3EC',
              color: isDark ? '#FFFFFF' : '#1C1917',
              fontSize: '0.8rem',
              fontWeight: 700,
              zIndex: 30,
              userSelect: 'none',
              flexShrink: 0
            }}
          >
            {/* Clock */}
            <span>{currentTime}</span>

            {/* DYNAMIC ISLAND / CAMERA NOTCH */}
            <div
              style={{
                width: '110px',
                height: '26px',
                backgroundColor: '#000000',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.5)'
              }}
            >
              {/* Camera dot */}
              <div
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  backgroundColor: '#1E1B4B',
                  border: '1.5px solid #312E81'
                }}
              />
              {/* Speaker mesh */}
              <div
                style={{
                  width: '32px',
                  height: '3px',
                  borderRadius: '2px',
                  backgroundColor: '#262626'
                }}
              />
            </div>

            {/* Network / Battery Icons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem' }}>
              <span>5G</span>
              <span>📶</span>
              <span>🔋 100%</span>
            </div>
          </div>

          {/* INNER SCROLLABLE TOUCH SCREEN */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            {children}
          </div>

          {/* PHONE HOME BAR INDICATOR (BOTTOM) */}
          <div
            style={{
              height: '24px',
              backgroundColor: isDark ? '#16100B' : '#F6F3EC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 30,
              flexShrink: 0
            }}
          >
            <div
              style={{
                width: '130px',
                height: '4.5px',
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)',
                borderRadius: '9999px'
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
