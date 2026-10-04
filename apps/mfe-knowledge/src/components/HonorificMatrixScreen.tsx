import React, { useState, useMemo, useEffect } from 'react';
import {
  HonorificInterpreter,
  HonorificPairItem,
  HONORIFIC_PAIRS_20,
  RelationCategory,
  FormalityLevel
} from '@vietlearning/content';
import { CuTitWisdomCard } from './CuTitWisdomCard';
import { HonorificExplorerDrawer } from './HonorificExplorerDrawer';
import { speechService } from '../services/speechSynthesis';

export interface HonorificMatrixScreenProps {
  initialTheme?: 'dark' | 'light';
  onPairChange?: (pair: { speaker: string; listener: string; pairId: string }) => void;
}

export const HonorificMatrixScreen: React.FC<HonorificMatrixScreenProps> = ({
  initialTheme = 'dark',
  onPairChange
}) => {
  const [theme, setTheme] = useState<'dark' | 'light'>(initialTheme);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Playground state
  // Age Slider: 0: Bề trên, 1: Lớn hơn, 2: Ngang hàng, 3: Nhỏ hơn
  const [ageStep, setAgeStep] = useState<number>(0);

  // Context Slider: 0: Trang trọng đình làng, 1: Lịch sự xã giao, 2: Thân mật ngõ xóm
  const [contextStep, setContextStep] = useState<number>(0);

  // Relation
  const [relation, setRelation] = useState<RelationCategory>('kin');

  // User Gender (Tôi là Nam / Nữ)
  const [userGender, setUserGender] = useState<'male' | 'female'>('male');

  // Partner Gender (Đối phương là Nam / Nữ / Chung)
  const [partnerGender, setPartnerGender] = useState<'male' | 'female' | 'neutral'>('male');

  // Speaker perspective (false: Tôi là người nói, true: Đối phương nói)
  const [isReversed, setIsReversed] = useState<boolean>(false);

  // Explicit selected pair from Drawer
  const [explicitPair, setExplicitPair] = useState<HonorificPairItem | null>(null);

  // Audio state
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [speechSpeed, setSpeechSpeed] = useState<number>(1.0);

  const interpreter = useMemo(() => new HonorificInterpreter(), []);

  // Compute ages based on ageStep
  const { speakerAge, listenerAge, speakerGender, listenerGender } = useMemo(() => {
    let uAge = 20; // Tuổi mặc định của người học
    let pAge = 20; // Tuổi đối phương

    switch (ageStep) {
      case 0: // Bề trên
        uAge = 20;
        pAge = relation === 'traditional' ? 75 : 55;
        break;
      case 1: // Lớn hơn
        uAge = 20;
        pAge = 26;
        break;
      case 2: // Ngang hàng
        uAge = 22;
        pAge = 22;
        break;
      case 3: // Nhỏ hơn
        uAge = 28;
        pAge = 16;
        break;
      default:
        uAge = 20;
        pAge = 50;
    }

    if (isReversed) {
      // Khi đối phương là người nói:
      const effectiveSpeakerGender: 'male' | 'female' =
        partnerGender === 'female' ? 'female' : 'male';
      const effectiveListenerGender: 'male' | 'female' = userGender;

      return {
        speakerAge: pAge,
        listenerAge: uAge,
        speakerGender: effectiveSpeakerGender,
        listenerGender: effectiveListenerGender
      };
    }

    // Khi người học (tôi) là người nói:
    return {
      speakerAge: uAge,
      listenerAge: pAge,
      speakerGender: userGender,
      listenerGender: partnerGender
    };
  }, [ageStep, relation, isReversed, userGender, partnerGender]);

  // Formality based on contextStep
  const formality: FormalityLevel = useMemo(() => {
    switch (contextStep) {
      case 0:
        return 'formal';
      case 1:
        return 'polite';
      case 2:
        return 'intimate';
      default:
        return 'polite';
    }
  }, [contextStep]);

  // Run Algorithm A6
  const evaluatedResult = useMemo(() => {
    if (explicitPair) {
      return interpreter.interpret({
        speakerAge,
        listenerAge,
        relation: explicitPair.relation,
        listenerGender,
        speakerGender,
        formality,
        pairId: explicitPair.id
      });
    }

    return interpreter.interpret({
      speakerAge,
      listenerAge,
      relation,
      listenerGender,
      speakerGender,
      formality
    });
  }, [interpreter, speakerAge, listenerAge, relation, listenerGender, speakerGender, formality, explicitPair]);

  // Notify parent if needed
  useEffect(() => {
    if (onPairChange) {
      onPairChange({
        speaker: evaluatedResult.speaker,
        listener: evaluatedResult.listener,
        pairId: evaluatedResult.pairId
      });
    }
  }, [evaluatedResult, onPairChange]);

  // Handle TTS play
  const handlePlayAudio = () => {
    if (isSpeaking) {
      speechService.stop();
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);
    speechService.speak(evaluatedResult.sampleSentence, {
      speed: speechSpeed,
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false)
    });
  };

  // Set state from Drawer pair selection
  const handleSelectPairFromDrawer = (pair: HonorificPairItem) => {
    setExplicitPair(pair);
    if (pair.relation) setRelation(pair.relation);

    // Determine ageStep
    const diff = pair.listenerAge - pair.speakerAge;
    if (diff > 10) setAgeStep(0);
    else if (diff > 2) setAgeStep(1);
    else if (diff >= -2) setAgeStep(2);
    else setAgeStep(3);

    // Determine contextStep
    if (pair.contextLevelText.includes('đình') || pair.contextLevelText.includes('Trang trọng')) {
      setContextStep(0);
    } else if (pair.contextLevelText.includes('Thân mật') || pair.contextLevelText.includes('Ruột thịt')) {
      setContextStep(2);
    } else {
      setContextStep(1);
    }

    if (pair.listenerGender) {
      setPartnerGender(pair.listenerGender);
    }
    if (pair.speakerGender) {
      setUserGender(pair.speakerGender);
    }
    setIsReversed(false);
  };

  const isDark = theme === 'dark';

  const ageLabels = [
    { step: 0, title: 'Bề Trên', desc: 'Bậc cha chú, cao niên (+15 ~ 60 tuổi)' },
    { step: 1, title: 'Lớn Hơn', desc: 'Anh/Chị tiền bối (+3 ~ 8 tuổi)' },
    { step: 2, title: 'Ngang Hàng', desc: 'Đồng niên, bạn bè (±2 tuổi)' },
    { step: 3, title: 'Nhỏ Hơn', desc: 'Em út, hậu bối (-3 ~ 20 tuổi)' }
  ];

  const contextLabels = [
    { step: 0, title: 'Trang Trọng Đình Làng', desc: 'Việc họ, lễ hội, ban tế tự, nghi lễ' },
    { step: 1, title: 'Lịch Sự Xã Giao', desc: 'Phố phường, công sở, trường lớp' },
    { step: 2, title: 'Thân Mật Ngõ Xóm', desc: 'Láng giềng, gia đình sum họp, tri kỷ' }
  ];

  const relationOptions: { id: RelationCategory; label: string; icon: string }[] = [
    { id: 'kin', label: 'Gia Tộc & Họ Hàng', icon: '🏡' },
    { id: 'social', label: 'Xã Hội & Đời Sống', icon: '🤝' },
    { id: 'traditional', label: 'Sân Đình & Tín Ngưỡng', icon: '🏛️' },
    { id: 'teacher_student', label: 'Thầy Trò & Sư Đồ', icon: '📚' },
    { id: 'work', label: 'Công Việc & Đoàn Thể', icon: '💼' }
  ];

  return (
    <div
      style={{
        fontFamily: '"Be Vietnam Pro", system-ui, -apple-system, sans-serif',
        backgroundColor: isDark ? '#16100B' : '#F6F3EC',
        color: isDark ? '#FDFBF7' : '#1C1917',
        minHeight: '100vh',
        padding: '1.5rem',
        boxSizing: 'border-box',
        transition: 'background-color 0.3s ease, color 0.3s ease'
      }}
    >
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        {/* TOP BAR / HEADER */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            paddingBottom: '1.25rem',
            borderBottom: isDark ? '2px solid #38281E' : '2px solid #E4D8C6',
            marginBottom: '1.5rem'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  backgroundColor: isDark ? '#78350F' : '#FDE68A',
                  color: isDark ? '#FEF3C7' : '#92400E'
                }}
              >
                Màn Hình M3 • Kiến Trúc Micro Frontend
              </span>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.5rem',
                  borderRadius: '6px',
                  backgroundColor: isDark ? '#3D2D23' : '#E8DEC8',
                  color: isDark ? '#D4B895' : '#78716C'
                }}
              >
                Thuật toán A6
              </span>
            </div>

            <h1
              style={{
                margin: '0.35rem 0 0 0',
                fontSize: '1.65rem',
                fontWeight: 900,
                color: isDark ? '#FBBF24' : '#047857',
                letterSpacing: '-0.02em',
                lineHeight: 1.2
              }}
            >
              Ma Trận Đại Từ Xưng Hô Sân Đình Cổ Truyền
            </h1>
            <p
              style={{
                margin: '0.25rem 0 0 0',
                fontSize: '0.86rem',
                color: isDark ? '#C4AA90' : '#64748B'
              }}
            >
              Mô phỏng bộ luật xưng hô tôn ti làng xã & chuẩn mực giao tiếp tiếng Việt
            </p>
          </div>

          {/* Theme & Drawer Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Theme Toggle (Stitch Screen 187903fa170042c6b7228d092d6c13ab / d27ed78d3bda42e6810f60e828a2fa84) */}
            <div
              style={{
                display: 'inline-flex',
                borderRadius: '10px',
                padding: '3px',
                backgroundColor: isDark ? '#261C15' : '#EAE2D3',
                border: isDark ? '1px solid #4A3728' : '1px solid #D6C7B2'
              }}
            >
              <button
                onClick={() => setTheme('dark')}
                style={{
                  padding: '0.4rem 0.75rem',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: theme === 'dark' ? 800 : 500,
                  backgroundColor: theme === 'dark' ? '#F59E0B' : 'transparent',
                  color: theme === 'dark' ? '#000000' : isDark ? '#D4B895' : '#57534E',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                🏮 Gỗ Mộc Cổ Truyền
              </button>
              <button
                onClick={() => setTheme('light')}
                style={{
                  padding: '0.4rem 0.75rem',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: theme === 'light' ? 800 : 500,
                  backgroundColor: theme === 'light' ? '#059669' : 'transparent',
                  color: theme === 'light' ? '#FFFFFF' : isDark ? '#D4B895' : '#57534E',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                🎋 Tre Trúc Sáng
              </button>
            </div>

            {/* Open Drawer Button */}
            <button
              onClick={() => setIsDrawerOpen(true)}
              style={{
                padding: '0.5rem 0.95rem',
                borderRadius: '10px',
                border: isDark ? '1px solid #B45309' : '1px solid #059669',
                backgroundColor: isDark ? '#2E2017' : '#FFFFFF',
                color: isDark ? '#FEF3C7' : '#047857',
                fontWeight: 700,
                fontSize: '0.84rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                boxShadow: isDark
                  ? '0 2px 8px rgba(0, 0, 0, 0.4)'
                  : '0 2px 8px rgba(5, 150, 105, 0.12)'
              }}
            >
              <span>📜</span>
              <span>Bảng 20 Cặp Chuẩn</span>
            </button>
          </div>
        </header>

        {/* MAIN INTERACTIVE WORKSPACE (2 COLUMNS OR GRID) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '1.5rem',
            alignItems: 'start'
          }}
        >
          {/* LEFT: INTERACTIVE CONTROLLER (BÀN ĐIỀU KHIỂN NHÂN XƯNG) */}
          <div
            style={{
              backgroundColor: isDark ? '#221812' : '#FFFFFF',
              borderRadius: '18px',
              padding: '1.5rem',
              border: isDark ? '1px solid #3D2D23' : '1px solid #E5D5C0',
              boxShadow: isDark
                ? '0 10px 30px rgba(0,0,0,0.5)'
                : '0 8px 24px rgba(180, 83, 9, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.35rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>🎛️</span>
                <h2
                  style={{
                    margin: 0,
                    fontSize: '1.1rem',
                    fontWeight: 800,
                    color: isDark ? '#FEF3C7' : '#1C1917'
                  }}
                >
                  Bàn Điều Khiển Ngữ Cảnh Xưng Hô
                </h2>
              </div>
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '6px',
                  backgroundColor: isDark ? '#38281E' : '#F5EFEB',
                  color: isDark ? '#F59E0B' : '#059669',
                  fontWeight: 700
                }}
              >
                Tương Tác Realtime
              </span>
            </div>

            {/* 1. MỐI QUAN HỆ GIAO TIẾP (RELATION) */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  marginBottom: '0.5rem',
                  color: isDark ? '#D4B895' : '#44403C'
                }}
              >
                1. Mối quan hệ giao tiếp:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                {relationOptions.map((r) => {
                  const active = relation === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => {
                        setExplicitPair(null);
                        setRelation(r.id);
                      }}
                      style={{
                        padding: '0.55rem 0.75rem',
                        borderRadius: '10px',
                        border: active
                          ? isDark
                            ? '1.5px solid #F59E0B'
                            : '1.5px solid #059669'
                          : isDark
                          ? '1px solid #3D2D23'
                          : '1px solid #E5D5C0',
                        backgroundColor: active
                          ? isDark
                            ? 'rgba(245, 158, 11, 0.18)'
                            : 'rgba(5, 150, 105, 0.12)'
                          : isDark
                          ? '#2A1F18'
                          : '#FAF7F2',
                        color: active
                          ? isDark
                            ? '#FBBF24'
                            : '#047857'
                          : isDark
                          ? '#C4AA90'
                          : '#57534E',
                        fontWeight: active ? 700 : 500,
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span style={{ fontSize: '1rem' }}>{r.icon}</span>
                      <span>{r.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. THANH TRƯỢT 1: ĐỘ CHÊNH LỆCH TUỔI TÁC (AGE RELATION SLIDER) */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.4rem'
                }}
              >
                <label
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: isDark ? '#D4B895' : '#44403C'
                  }}
                >
                  2. Chênh lệch tuổi tác:
                </label>
                <span
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    color: isDark ? '#F59E0B' : '#059669'
                  }}
                >
                  {ageLabels[ageStep].title}
                </span>
              </div>

              {/* Slider Input */}
              <input
                type="range"
                min={0}
                max={3}
                step={1}
                value={ageStep}
                onChange={(e) => {
                  setExplicitPair(null);
                  setAgeStep(parseInt(e.target.value, 10));
                }}
                style={{
                  width: '100%',
                  accentColor: isDark ? '#F59E0B' : '#059669',
                  cursor: 'pointer',
                  marginBottom: '0.5rem'
                }}
              />

              {/* Discrete Step Indicators */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '0.35rem'
                }}
              >
                {ageLabels.map((lbl) => {
                  const active = ageStep === lbl.step;
                  return (
                    <button
                      key={lbl.step}
                      onClick={() => {
                        setExplicitPair(null);
                        setAgeStep(lbl.step);
                      }}
                      style={{
                        padding: '0.4rem 0.25rem',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.72rem',
                        fontWeight: active ? 700 : 500,
                        backgroundColor: active
                          ? isDark
                            ? '#F59E0B'
                            : '#059669'
                          : isDark
                          ? '#2C2018'
                          : '#F0E9DF',
                        color: active ? (isDark ? '#000000' : '#FFFFFF') : isDark ? '#A38C76' : '#78716C',
                        transition: 'all 0.15s ease',
                        textAlign: 'center'
                      }}
                    >
                      {lbl.title}
                    </button>
                  );
                })}
              </div>
              <div
                style={{
                  fontSize: '0.72rem',
                  fontStyle: 'italic',
                  color: isDark ? '#9E8672' : '#78716C',
                  marginTop: '0.35rem'
                }}
              >
                Chi tiết: {ageLabels[ageStep].desc}
              </div>
            </div>

            {/* 3. THANH TRƯỢT 2: BỐI CẢNH GIAO TIẾP & MỨC ĐỘ TRANG TRỌNG (CONTEXT SLIDER) */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.4rem'
                }}
              >
                <label
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: isDark ? '#D4B895' : '#44403C'
                  }}
                >
                  3. Bối cảnh không gian & Nghi thức:
                </label>
                <span
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    color: isDark ? '#F59E0B' : '#059669'
                  }}
                >
                  {contextLabels[contextStep].title}
                </span>
              </div>

              {/* Slider Input */}
              <input
                type="range"
                min={0}
                max={2}
                step={1}
                value={contextStep}
                onChange={(e) => {
                  setExplicitPair(null);
                  setContextStep(parseInt(e.target.value, 10));
                }}
                style={{
                  width: '100%',
                  accentColor: isDark ? '#F59E0B' : '#059669',
                  cursor: 'pointer',
                  marginBottom: '0.5rem'
                }}
              />

              {/* Discrete Step Indicators */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '0.35rem'
                }}
              >
                {contextLabels.map((lbl) => {
                  const active = contextStep === lbl.step;
                  return (
                    <button
                      key={lbl.step}
                      onClick={() => {
                        setExplicitPair(null);
                        setContextStep(lbl.step);
                      }}
                      style={{
                        padding: '0.4rem 0.25rem',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.72rem',
                        fontWeight: active ? 700 : 500,
                        backgroundColor: active
                          ? isDark
                            ? '#F59E0B'
                            : '#059669'
                          : isDark
                          ? '#2C2018'
                          : '#F0E9DF',
                        color: active ? (isDark ? '#000000' : '#FFFFFF') : isDark ? '#A38C76' : '#78716C',
                        transition: 'all 0.15s ease',
                        textAlign: 'center'
                      }}
                    >
                      {lbl.title}
                    </button>
                  );
                })}
              </div>
              <div
                style={{
                  fontSize: '0.72rem',
                  fontStyle: 'italic',
                  color: isDark ? '#9E8672' : '#78716C',
                  marginTop: '0.35rem'
                }}
              >
                Không gian: {contextLabels[contextStep].desc}
              </div>
            </div>

            {/* 4. ĐỊNH DANH GIỚI TÍNH 2 PHÍA & ĐỔI CHIỀU NÓI */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                paddingTop: '0.35rem',
                borderTop: isDark ? '1px dashed #3D2D23' : '1px dashed #E5D5C0'
              }}
            >
              {/* Hàng chọn giới tính: Tôi vs Đối phương */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.75rem'
                }}
              >
                {/* Giới tính của TÔI */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      marginBottom: '0.35rem',
                      color: isDark ? '#D4B895' : '#44403C'
                    }}
                  >
                    Tôi là ({isReversed ? 'Người nghe' : 'Người nói'}):
                  </label>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    {[
                      { id: 'male', label: '👨 Nam' },
                      { id: 'female', label: '👩 Nữ' }
                    ].map((g) => {
                      const active = userGender === g.id;
                      return (
                        <button
                          key={g.id}
                          onClick={() => {
                            setExplicitPair(null);
                            setUserGender(g.id as any);
                          }}
                          style={{
                            flex: 1,
                            padding: '0.4rem 0.2rem',
                            borderRadius: '6px',
                            border: active
                              ? isDark
                                ? '1.5px solid #F59E0B'
                                : '1.5px solid #059669'
                              : isDark
                              ? '1px solid #3D2D23'
                              : '1px solid #D6C7B2',
                            backgroundColor: active
                              ? isDark
                                ? '#3D2817'
                                : '#E8F5E9'
                              : isDark
                              ? '#261C15'
                              : '#FFFFFF',
                            color: active
                              ? isDark
                                ? '#FDE68A'
                                : '#059669'
                              : isDark
                              ? '#C4AA90'
                              : '#57534E',
                            fontSize: '0.72rem',
                            fontWeight: active ? 700 : 500,
                            cursor: 'pointer'
                          }}
                        >
                          {g.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Giới tính ĐỐI PHƯƠNG */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      marginBottom: '0.35rem',
                      color: isDark ? '#D4B895' : '#44403C'
                    }}
                  >
                    Đối phương ({isReversed ? 'Người nói' : 'Người nghe'}):
                  </label>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    {[
                      { id: 'male', label: '👨 Nam' },
                      { id: 'female', label: '👩 Nữ' },
                      { id: 'neutral', label: '👥 Chung' }
                    ].map((g) => {
                      const active = partnerGender === g.id;
                      return (
                        <button
                          key={g.id}
                          onClick={() => {
                            setExplicitPair(null);
                            setPartnerGender(g.id as any);
                          }}
                          style={{
                            flex: 1,
                            padding: '0.4rem 0.2rem',
                            borderRadius: '6px',
                            border: active
                              ? isDark
                                ? '1.5px solid #F59E0B'
                                : '1.5px solid #059669'
                              : isDark
                              ? '1px solid #3D2D23'
                              : '1px solid #D6C7B2',
                            backgroundColor: active
                              ? isDark
                                ? '#3D2817'
                                : '#E8F5E9'
                              : isDark
                              ? '#261C15'
                              : '#FFFFFF',
                            color: active
                              ? isDark
                                ? '#FDE68A'
                                : '#059669'
                              : isDark
                              ? '#C4AA90'
                              : '#57534E',
                            fontSize: '0.72rem',
                            fontWeight: active ? 700 : 500,
                            cursor: 'pointer'
                          }}
                        >
                          {g.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Nút Đổi chiều góc nhìn hội thoại */}
              <div>
                <button
                  onClick={() => {
                    setExplicitPair(null);
                    setIsReversed(!isReversed);
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    border: isDark ? '1px solid #B45309' : '1px solid #059669',
                    backgroundColor: isReversed
                      ? isDark
                        ? '#78350F'
                        : '#047857'
                      : isDark
                      ? '#2A1F18'
                      : '#F8FAFC',
                    color: isReversed ? '#FFFFFF' : isDark ? '#FEF3C7' : '#334155',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ fontSize: '1rem' }}>🔄</span>
                  <span>
                    Góc nhìn: {isReversed ? 'Đối phương đang nói với Tôi' : 'Tôi đang nói với Đối phương'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: LIVE SENTENCE & 3 GRAMMATICAL CHIPS (KHUNG CÂU SỐNG & PHÂN TÍCH NGỮ PHÁP) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Banner Khung câu trực tiếp */}
            <div
              style={{
                backgroundColor: isDark ? '#231812' : '#FFFFFF',
                borderRadius: '18px',
                padding: '1.5rem',
                border: isDark ? '1px solid #78350F' : '1px solid #E5D5C0',
                boxShadow: isDark
                  ? '0 12px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(245, 158, 11, 0.2)'
                  : '0 10px 28px rgba(180, 83, 9, 0.08), inset 0 1px 0 #FFFFFF',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                position: 'relative'
              }}
            >
              {/* Header result */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: isDark ? '1px dashed #3D2D23' : '1px dashed #E5D5C0',
                  paddingBottom: '0.75rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span style={{ fontSize: '1.2rem' }}>💬</span>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: isDark ? '#F59E0B' : '#059669'
                    }}
                  >
                    Mẫu Câu Xưng Hô Trực Quan
                  </span>
                </div>

                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.5rem',
                    borderRadius: '6px',
                    backgroundColor: isDark ? '#38281E' : '#FEF3C7',
                    color: isDark ? '#FDE68A' : '#92400E'
                  }}
                >
                  Cặp: {evaluatedResult.speaker} ➔ {evaluatedResult.listener} ({evaluatedResult.pairId.toUpperCase()})
                </span>
              </div>

              {/* The Live Sentence */}
              <div
                style={{
                  padding: '1.15rem 1.25rem',
                  borderRadius: '14px',
                  backgroundColor: isDark ? '#19110B' : '#FFFDF9',
                  border: isDark ? '1.5px solid #B45309' : '1.5px solid #059669',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  boxShadow: isDark
                    ? 'inset 0 2px 6px rgba(0, 0, 0, 0.4)'
                    : 'inset 0 2px 6px rgba(180, 83, 9, 0.05)'
                }}
              >
                <div
                  style={{
                    fontSize: '1.2rem',
                    fontWeight: 800,
                    lineHeight: 1.5,
                    color: isDark ? '#FFFBEB' : '#0F172A',
                    fontStyle: 'normal'
                  }}
                >
                  "{evaluatedResult.sampleSentence}"
                </div>

                <div
                  style={{
                    fontSize: '0.78rem',
                    color: isDark ? '#D4B895' : '#64748B',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    flexWrap: 'wrap'
                  }}
                >
                  <span>📍 Bối cảnh phù hợp:</span>
                  <strong style={{ color: isDark ? '#FBBF24' : '#047857' }}>
                    {contextLabels[contextStep].title} • {ageLabels[ageStep].title}
                  </strong>
                  {explicitPair && (
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: '0.7rem',
                        color: isDark ? '#FBBF24' : '#047857',
                        background: isDark ? '#2E2017' : '#E8F5E9',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '4px'
                      }}
                    >
                      ✓ Áp dụng từ Bảng 20 Cặp
                    </span>
                  )}
                </div>
              </div>

              {/* 3 GRAMMATICAL CHIPS (NGÔI 1, NGÔI 2, KÍNH NGỮ/TRỢ TỪ) */}
              <div>
                <div
                  style={{
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: isDark ? '#D4B895' : '#57534E',
                    marginBottom: '0.5rem'
                  }}
                >
                  Cấu Trúc 3 Thành Tố Ngữ Pháp:
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: '0.5rem'
                  }}
                >
                  {/* CHIP 1: NGÔI 1 (SPEAKER) */}
                  <div
                    style={{
                      padding: '0.6rem 0.75rem',
                      borderRadius: '10px',
                      backgroundColor: isDark ? '#3B1515' : '#FEE2E2',
                      border: isDark ? '1px solid #991B1B' : '1px solid #FCA5A5',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.2rem'
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: isDark ? '#FCA5A5' : '#991B1B'
                      }}
                    >
                      Thành tố 1: Ngôi 1 (Mình)
                    </span>
                    <span
                      style={{
                        fontSize: '1.05rem',
                        fontWeight: 900,
                        color: isDark ? '#FFFFFF' : '#7F1D1D'
                      }}
                    >
                      {evaluatedResult.speaker}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: isDark ? '#FECACA' : '#B91C1C' }}>
                      Đại từ nhân xưng xưng mình
                    </span>
                  </div>

                  {/* CHIP 2: NGÔI 2 (LISTENER) */}
                  <div
                    style={{
                      padding: '0.6rem 0.75rem',
                      borderRadius: '10px',
                      backgroundColor: isDark ? '#42240C' : '#FEF3C7',
                      border: isDark ? '1px solid #B45309' : '1px solid #FCD34D',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.2rem'
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: isDark ? '#FDE68A' : '#92400E'
                      }}
                    >
                      Thành tố 2: Ngôi 2 (Gọi)
                    </span>
                    <span
                      style={{
                        fontSize: '1.05rem',
                        fontWeight: 900,
                        color: isDark ? '#FFFFFF' : '#78350F'
                      }}
                    >
                      {evaluatedResult.listener}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: isDark ? '#FEF3C7' : '#B45309' }}>
                      Tôn xưng đối phương
                    </span>
                  </div>

                  {/* CHIP 3: KÍNH NGỮ & TRỢ TỪ (HONORIFIC MARKER) */}
                  <div
                    style={{
                      padding: '0.6rem 0.75rem',
                      borderRadius: '10px',
                      backgroundColor: isDark ? '#063B2C' : '#D1FAE5',
                      border: isDark ? '1px solid #059669' : '1px solid #6EE7B7',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.2rem'
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: isDark ? '#A7F3D0' : '#065F46'
                      }}
                    >
                      Thành tố 3: Kính ngữ
                    </span>
                    <span
                      style={{
                        fontSize: '1.05rem',
                        fontWeight: 900,
                        color: isDark ? '#FFFFFF' : '#047857'
                      }}
                    >
                      {evaluatedResult.politeParticle}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: isDark ? '#D1FAE5' : '#059669' }}>
                      Trợ từ lễ tiết & phong tục
                    </span>
                  </div>
                </div>
              </div>

              {/* AUDIO SYNTHESIS & PLAYBACK CONTROLS */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  paddingTop: '0.5rem',
                  borderTop: isDark ? '1px solid #38281E' : '1px solid #E5D5C0'
                }}
              >
                {/* Play Button */}
                <button
                  onClick={handlePlayAudio}
                  style={{
                    padding: '0.65rem 1.25rem',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: isSpeaking
                      ? isDark
                        ? '#DC2626'
                        : '#E11D48'
                      : isDark
                      ? '#F59E0B'
                      : '#059669',
                    color: isSpeaking ? '#FFFFFF' : isDark ? '#000000' : '#FFFFFF',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: isDark
                      ? '0 4px 14px rgba(245, 158, 11, 0.3)'
                      : '0 4px 14px rgba(5, 150, 105, 0.25)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ fontSize: '1.1rem' }}>{isSpeaking ? '⏹️' : '🔊'}</span>
                  <span>{isSpeaking ? 'Đang phát âm... (Bấm dừng)' : 'Nghe Phát Âm Mẫu'}</span>
                </button>

                {/* Speed Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: isDark ? '#A38C76' : '#78716C'
                    }}
                  >
                    Tốc độ:
                  </span>
                  {[0.8, 1.0, 1.2].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => setSpeechSpeed(spd)}
                      style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '6px',
                        border: 'none',
                        fontSize: '0.72rem',
                        fontWeight: speechSpeed === spd ? 800 : 500,
                        backgroundColor:
                          speechSpeed === spd
                            ? isDark
                              ? '#F59E0B'
                              : '#059669'
                            : isDark
                            ? '#2E221A'
                            : '#EDE4D6',
                        color:
                          speechSpeed === spd
                            ? '#000000'
                            : isDark
                            ? '#D4B895'
                            : '#57534E',
                        cursor: 'pointer'
                      }}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* BÉ CU TÍT FOLK WISDOM CARD */}
            <CuTitWisdomCard
              wisdom={evaluatedResult.wisdomTip}
              explanation={evaluatedResult.explanation}
              relationName={relationOptions.find((r) => r.id === relation)?.label || relation}
              theme={theme}
            />
          </div>
        </div>

        {/* 20-PAIR EXPLORER DRAWER MODAL */}
        <HonorificExplorerDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          onSelectPair={handleSelectPairFromDrawer}
          theme={theme}
        />
      </div>
    </div>
  );
};
