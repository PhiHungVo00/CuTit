import React from 'react';

export interface ToneItem {
  id: string;
  name: string;
  symbol: string;
  sampleWord: string;
  ipa: string;
  description: string;
  contourShape: string;
}

export const VIETNAMESE_6_TONES: ToneItem[] = [
  {
    id: 'hoi',
    name: 'Thanh Hỏi (Dấu Hỏi)',
    symbol: 'ả',
    sampleWord: 'Phở',
    ipa: '/fəː˧˩˧/',
    description: 'Hạ giọng trầm rồi vút cao lên vòm họng',
    contourShape: 'M 10 25 C 40 25, 60 45, 90 45 C 110 45, 120 20, 140 10'
  },
  {
    id: 'ngang',
    name: 'Thanh Ngang (Không Dấu)',
    symbol: 'a',
    sampleWord: 'Ba',
    ipa: '/ɓaː˧˧/',
    description: 'Cao độ trung bình, giữ đều hơi phẳng lặng',
    contourShape: 'M 10 25 L 140 25'
  },
  {
    id: 'huyen',
    name: 'Thanh Huyền (Dấu Huyền)',
    symbol: 'à',
    sampleWord: 'Bà',
    ipa: '/ɓaː˨˩/',
    description: 'Bắt đầu trung bình rồi thoải nhẹ xuống thấp êm ái',
    contourShape: 'M 10 20 C 50 25, 90 35, 140 45'
  },
  {
    id: 'sac',
    name: 'Thanh Sắc (Dấu Sắc)',
    symbol: 'á',
    sampleWord: 'Má',
    ipa: '/maː˧˥/',
    description: 'Bắt đầu cao vừa rồi vút thẳng lên cao sắc sảo',
    contourShape: 'M 10 45 C 50 40, 90 25, 140 10'
  },
  {
    id: 'nga',
    name: 'Thanh Ngã (Dấu Ngã)',
    symbol: 'ã',
    sampleWord: 'Mã',
    ipa: '/maː˦ˀ˥/',
    description: 'Lên nhẹ, khép dây thanh tắc nghẽn rồi bật cao',
    contourShape: 'M 10 35 C 30 20, 60 15, 80 30 C 100 40, 120 20, 140 10'
  },
  {
    id: 'nang',
    name: 'Thanh Nặng (Dấu Nặng)',
    symbol: 'ạ',
    sampleWord: 'Mạ',
    ipa: '/maː˨˩ˀ/',
    description: 'Rơi thẳng xuống đáy giọng và ngắt đột ngột',
    contourShape: 'M 10 25 C 40 30, 80 45, 110 50'
  }
];

export interface ToneSelectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedToneId: string;
  onSelectTone: (tone: ToneItem) => void;
  isDark?: boolean;
}

export const ToneSelectorDrawer: React.FC<ToneSelectorDrawerProps> = ({
  isOpen,
  onClose,
  selectedToneId,
  onSelectTone,
  isDark = true
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-sm h-full flex flex-col p-4 shadow-2xl transition-transform overflow-y-auto ${
          isDark ? 'bg-[#1c0904] text-[#ffdbcf]' : 'bg-[#FFFBF5] text-[#271900]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#3c241b] mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary text-2xl">music_note</span>
            <h3 className="font-bold text-base">Hệ Thống 6 Thanh Điệu</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#301a12] text-[#ffb4aa] flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <p className="text-xs opacity-80 mb-3">
          Chọn thanh điệu dân gian để hiển thị đường cong cao độ F0 mẫu:
        </p>

        {/* List of 6 tones */}
        <div className="flex flex-col gap-2.5">
          {VIETNAMESE_6_TONES.map((tone) => {
            const isSelected = tone.id === selectedToneId;
            return (
              <button
                key={tone.id}
                onClick={() => {
                  onSelectTone(tone);
                  onClose();
                }}
                className={`p-3 rounded-xl flex items-center justify-between transition-all text-left ${
                  isSelected
                    ? 'bg-[#e56c5e] text-[#5a0304] shadow-[0_3px_0_#5a0304]'
                    : isDark
                    ? 'bg-[#301a12] text-[#ffdbcf] hover:bg-[#3c241b] shadow-[0_2px_0_#1c0904]'
                    : 'bg-[#EFE2D3] text-[#271900] hover:bg-[#E5D5C0] shadow-[0_2px_0_#D6C7B2]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold ${
                      isSelected
                        ? 'bg-[#5a0304] text-white'
                        : isDark
                        ? 'bg-[#1c0904] text-[#f8bc4b]'
                        : 'bg-white text-[#B45309]'
                    }`}
                  >
                    {tone.sampleWord}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-sm">{tone.name}</span>
                    <span className="text-[11px] opacity-80">{tone.ipa} • {tone.description}</span>
                  </div>
                </div>

                {/* Mini SVG Curve Preview */}
                <svg className="w-12 h-6 shrink-0" viewBox="0 0 150 60">
                  <path
                    d={tone.contourShape}
                    fill="none"
                    stroke={isSelected ? '#5a0304' : '#f8bc4b'}
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
