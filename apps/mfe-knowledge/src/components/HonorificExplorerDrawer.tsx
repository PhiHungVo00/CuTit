import React, { useState, useMemo } from 'react';
import { HonorificPairItem, HONORIFIC_PAIRS_20 } from '@vietlearning/content';
import { speechService } from '../services/speechSynthesis';

export interface HonorificExplorerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPair: (pair: HonorificPairItem) => void;
  theme: 'dark' | 'light';
}

export const HonorificExplorerDrawer: React.FC<HonorificExplorerDrawerProps> = ({
  isOpen,
  onClose,
  onSelectPair,
  theme
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [playingId, setPlayingId] = useState<string | null>(null);

  const isDark = theme === 'dark';

  const categories = [
    { id: 'all', label: 'Tất cả (20 cặp)' },
    { id: 'traditional', label: '🏛️ Sân đình & Nghi lễ' },
    { id: 'kin', label: '🏡 Gia tộc & Họ hàng' },
    { id: 'social', label: '🤝 Xã hội & Bạn bè' },
    { id: 'teacher_student', label: '📚 Thầy trò' },
    { id: 'civic', label: '💼 Công sở & Đoàn thể' }
  ];

  const filteredPairs = useMemo(() => {
    const normalizeVN = (str: string) =>
      str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'd');

    const q = searchTerm.trim().toLowerCase();
    const qNorm = normalizeVN(q);

    return HONORIFIC_PAIRS_20.filter(item => {
      const matchCat =
        selectedCategory === 'all' ||
        item.category === selectedCategory ||
        item.relation === selectedCategory;

      if (!q) return matchCat;

      const matchSearch =
        item.relationName.toLowerCase().includes(q) ||
        normalizeVN(item.relationName).includes(qNorm) ||
        item.speaker.toLowerCase().includes(q) ||
        normalizeVN(item.speaker).includes(qNorm) ||
        item.listener.toLowerCase().includes(q) ||
        normalizeVN(item.listener).includes(qNorm) ||
        item.example.toLowerCase().includes(q) ||
        normalizeVN(item.example).includes(qNorm) ||
        item.explanation.toLowerCase().includes(q) ||
        normalizeVN(item.explanation).includes(qNorm) ||
        item.politeParticle.toLowerCase().includes(q) ||
        normalizeVN(item.politeParticle).includes(qNorm);

      return matchCat && matchSearch;
    });
  }, [searchTerm, selectedCategory]);

  const handlePlayAudio = (item: HonorificPairItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (playingId === item.id) {
      speechService.stop();
      setPlayingId(null);
      return;
    }

    setPlayingId(item.id);
    speechService.speak(item.example, {
      speed: 1.0,
      onEnd: () => setPlayingId(null),
      onError: () => setPlayingId(null)
    });
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'flex-end',
        transition: 'all 0.3s ease'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          height: '100%',
          backgroundColor: isDark ? '#1C1510' : '#FAF7F2',
          borderLeft: isDark ? '2px solid #B45309' : '2px solid #D6C7B2',
          boxShadow: isDark
            ? '-10px 0 30px rgba(0, 0, 0, 0.8)'
            : '-10px 0 30px rgba(180, 83, 9, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: isDark ? '1px solid #3D2D23' : '1px solid #E5D5C0',
            background: isDark
              ? 'linear-gradient(to right, #241A14, #2E221A)'
              : 'linear-gradient(to right, #FFFDF9, #F5EFEB)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.4rem' }}>📜</span>
              <h3
                style={{
                  margin: 0,
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  color: isDark ? '#FEF3C7' : '#1C1917',
                  fontFamily: '"Be Vietnam Pro", system-ui, sans-serif'
                }}
              >
                Bảng 20 Cặp Đại Từ Chuẩn (Thuật Toán A6)
              </h3>
            </div>
            <p
              style={{
                margin: '0.25rem 0 0 0',
                fontSize: '0.8rem',
                color: isDark ? '#D4B895' : '#78716C'
              }}
            >
              Ma trận tôn ti xưng hô sân đình & xã hội Việt Nam
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: isDark ? '#2E221A' : '#EDE4D6',
              border: isDark ? '1px solid #78350F' : '1px solid #C4B5A5',
              color: isDark ? '#FEF3C7' : '#1C1917',
              borderRadius: '8px',
              padding: '0.4rem 0.75rem',
              fontSize: '0.85rem',
              cursor: 'pointer',
              fontWeight: 700
            }}
          >
            ✕ Đóng
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderBottom: isDark ? '1px solid #2E221A' : '1px solid #E8DEC8',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            background: isDark ? '#1F1712' : '#F9F5EE'
          }}
        >
          {/* Input search */}
          <div style={{ position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '0.9rem'
              }}
            >
              🔍
            </span>
            <input
              type="text"
              placeholder="Tìm theo đại từ (bác, thầy, cụ), mối quan hệ, ví dụ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem 0.6rem 2.25rem',
                borderRadius: '8px',
                border: isDark ? '1px solid #4A3728' : '1px solid #D6C7B2',
                backgroundColor: isDark ? '#2A1F18' : '#FFFFFF',
                color: isDark ? '#FDFBF7' : '#1C1917',
                fontSize: '0.86rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Category Chips */}
          <div
            style={{
              display: 'flex',
              gap: '0.4rem',
              overflowX: 'auto',
              paddingBottom: '0.25rem'
            }}
          >
            {categories.map((c) => {
              const active = selectedCategory === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  style={{
                    whiteSpace: 'nowrap',
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.75rem',
                    borderRadius: '20px',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: active ? 700 : 500,
                    backgroundColor: active
                      ? isDark
                        ? '#F59E0B'
                        : '#059669'
                      : isDark
                      ? '#2E221A'
                      : '#EDE4D6',
                    color: active ? '#000000' : isDark ? '#D4B895' : '#44403C',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* List of Pairs */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem'
          }}
        >
          {filteredPairs.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '3rem 1rem',
                color: isDark ? '#8C7461' : '#A8A29E'
              }}
            >
              Không tìm thấy cặp đại từ nào phù hợp với từ khóa "{searchTerm}".
            </div>
          ) : (
            filteredPairs.map((item, idx) => {
              const isPlaying = playingId === item.id;
              return (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: isDark ? '#261C15' : '#FFFFFF',
                    borderRadius: '12px',
                    padding: '1rem',
                    border: isDark ? '1px solid #3D2D23' : '1px solid #E5D5C0',
                    boxShadow: isDark
                      ? '0 2px 8px rgba(0, 0, 0, 0.4)'
                      : '0 2px 8px rgba(180, 83, 9, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                    transition: 'border-color 0.2s ease'
                  }}
                >
                  {/* Row 1: Pair Badges & Category */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.5rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          padding: '0.15rem 0.4rem',
                          borderRadius: '4px',
                          background: isDark ? '#3D2D23' : '#F5EFEB',
                          color: isDark ? '#F59E0B' : '#B45309'
                        }}
                      >
                        #{idx + 1} • {item.id.toUpperCase()}
                      </span>
                      <strong
                        style={{
                          fontSize: '0.9rem',
                          color: isDark ? '#FEF3C7' : '#1C1917'
                        }}
                      >
                        {item.relationName}
                      </strong>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '9999px',
                          background: isDark
                            ? 'rgba(245, 158, 11, 0.15)'
                            : 'rgba(5, 150, 105, 0.15)',
                          color: isDark ? '#FBBF24' : '#059669',
                          fontWeight: 600
                        }}
                      >
                        {item.ageRelationText}
                      </span>
                    </div>
                  </div>

                  {/* Row 2: Pair Formula */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      background: isDark ? 'rgba(0, 0, 0, 0.25)' : '#FDFBF7',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      border: isDark ? '1px dashed #4A3728' : '1px dashed #D6C7B2'
                    }}
                  >
                    <span
                      style={{
                        padding: '0.2rem 0.6rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        backgroundColor: isDark ? '#7F1D1D' : '#FEE2E2',
                        color: isDark ? '#FECACA' : '#991B1B'
                      }}
                    >
                      Xưng: {item.speaker}
                    </span>
                    <span style={{ color: isDark ? '#D4B895' : '#78716C', fontWeight: 800 }}>➔</span>
                    <span
                      style={{
                        padding: '0.2rem 0.6rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        backgroundColor: isDark ? '#78350F' : '#FEF3C7',
                        color: isDark ? '#FEF3C7' : '#92400E'
                      }}
                    >
                      Gọi: {item.listener}
                    </span>
                    <span
                      style={{
                        marginLeft: 'auto',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: isDark ? '#064E3B' : '#D1FAE5',
                        color: isDark ? '#A7F3D0' : '#065F46'
                      }}
                    >
                      {item.politeParticle}
                    </span>
                  </div>

                  {/* Row 3: Example Sentence */}
                  <div
                    style={{
                      fontSize: '0.84rem',
                      fontStyle: 'italic',
                      color: isDark ? '#E2D3BE' : '#334155',
                      lineHeight: 1.5,
                      background: isDark ? '#1E1611' : '#F8F5EE',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px'
                    }}
                  >
                    "{item.example}"
                  </div>

                  {/* Row 4: Actions */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: '0.5rem',
                      marginTop: '0.2rem'
                    }}
                  >
                    <button
                      onClick={(e) => handlePlayAudio(item, e)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.35rem 0.75rem',
                        borderRadius: '6px',
                        border: isDark ? '1px solid #78350F' : '1px solid #D6C7B2',
                        backgroundColor: isPlaying
                          ? isDark
                            ? '#D97706'
                            : '#059669'
                          : isDark
                          ? '#2A1F18'
                          : '#FFFFFF',
                        color: isPlaying ? '#FFFFFF' : isDark ? '#FEF3C7' : '#1C1917',
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {isPlaying ? '🔊 Đang đọc...' : '🔈 Nghe mẫu'}
                    </button>

                    <button
                      onClick={() => {
                        onSelectPair(item);
                        onClose();
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.35rem 0.75rem',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: isDark ? '#F59E0B' : '#059669',
                        color: isDark ? '#000000' : '#FFFFFF',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      ⚡ Áp dụng lên bàn điều khiển
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Note */}
        <div
          style={{
            padding: '0.75rem 1.5rem',
            borderTop: isDark ? '1px solid #2E221A' : '1px solid #E8DEC8',
            fontSize: '0.75rem',
            color: isDark ? '#9E8672' : '#78716C',
            textAlign: 'center',
            background: isDark ? '#1A130E' : '#F5EFEB'
          }}
        >
          Thuật toán A6 (GoF Interpreter) • Lưu trữ 20 quan hệ mẫu chuẩn Bộ tiêu chuẩn TDD UIT
        </div>
      </div>
    </div>
  );
};
