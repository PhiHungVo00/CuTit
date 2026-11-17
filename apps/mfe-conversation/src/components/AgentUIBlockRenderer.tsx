import React from 'react';
import { AgentUIBlock } from '@vietlearning/contracts';

interface Props {
  blocks: AgentUIBlock[];
  onAction?: (actionType: string, payload: any) => void;
  onSendQuickReply?: (text: string) => void;
}

export const AgentUIBlockRenderer: React.FC<Props> = ({ blocks, onAction, onSendQuickReply }) => {
  if (!blocks || blocks.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 my-2 w-full animate-fadeIn">
      {blocks.map((block) => {
        switch (block.type) {
          case 'drill_card':
            return (
              <div
                key={block.id}
                className="w-full bg-[#301a12] border border-[#ffb4aa]/20 rounded-2xl p-3.5 shadow-[0_4px_0_#1c0904] flex flex-col gap-2.5 relative overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[#f8bc4b] text-xl">restaurant_menu</span>
                    <h4 className="font-bold text-sm text-[#ffdbcf]">{block.title || 'Thực đơn gợi ý'}</h4>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#e56c5e] text-[#410002] font-bold">
                    Gợi ý gọi món
                  </span>
                </div>

                {Array.isArray(block.payload?.items) && (
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {block.payload.items.map((item: any, idx: number) => (
                      <div
                        key={idx}
                        onClick={() => onSendQuickReply?.(`Dạ cho em một phần ${item.name} nhé!`)}
                        className="bg-[#3c241b] hover:bg-[#482f25] active:scale-95 transition-all cursor-pointer rounded-xl p-2.5 flex flex-col gap-1 border border-[#ffb4aa]/10 shadow-[0_2px_0_#1c0904]"
                      >
                        <div className="flex justify-between items-baseline">
                          <span className="font-bold text-xs text-white truncate">{item.name}</span>
                          <span className="text-xs text-[#f8bc4b] font-extrabold">{item.price}</span>
                        </div>
                        <span className="text-[11px] text-[#dec0bc] line-clamp-2">{item.desc}</span>
                        <div className="flex justify-end mt-1">
                          <span className="text-[10px] text-[#ffb4aa] bg-[#ffb4aa]/10 px-1.5 py-0.5 rounded font-bold">
                            + Chọn món
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );

          case 'quick_replies':
            return (
              <div key={block.id} className="flex flex-col gap-1.5 w-full mt-1">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] text-[#dec0bc] uppercase tracking-wider font-semibold">
                    {block.title || 'Gợi ý phản hồi nhanh'}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {Array.isArray(block.payload?.options) &&
                    block.payload.options.map((opt: any, idx: number) => {
                      const letter = String.fromCharCode(65 + idx);
                      return (
                        <button
                          key={opt.id || idx}
                          onClick={() => onSendQuickReply?.(opt.text)}
                          className="w-full text-left bg-[#3c241b] hover:bg-[#4d332a] active:translate-y-0.5 active:shadow-none transition-all rounded-xl p-2.5 shadow-[0_3px_0_#1c0904] flex items-center justify-between group border border-[#ffb4aa]/10"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-6 h-6 rounded-lg bg-[#301a12] flex items-center justify-center text-[#f8bc4b] font-bold text-xs shrink-0 shadow-inner">
                              {letter}
                            </span>
                            <span className="text-xs text-[#ffdbcf] font-medium truncate">{opt.text}</span>
                          </div>
                          <span className="material-symbols-outlined text-[#a58b87] group-hover:text-[#f8bc4b] text-base shrink-0 transition-colors">
                            arrow_forward
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            );

          case 'culture_card':
          case 'culture_pill':
            return (
              <div
                key={block.id}
                className="w-full bg-gradient-to-br from-[#301a12] to-[#2c160e] border border-[#f8bc4b]/30 rounded-2xl p-3 shadow-[0_3px_0_#1c0904] flex items-start gap-2.5"
              >
                <div className="w-8 h-8 rounded-full bg-[#f8bc4b]/20 flex items-center justify-center text-[#f8bc4b] shrink-0">
                  <span className="material-symbols-outlined text-lg">lightbulb</span>
                </div>
                <div className="flex-1 text-xs">
                  <div className="font-bold text-[#f8bc4b] mb-1">{block.title || 'Mẹo văn hóa dân gian'}</div>
                  <p className="text-[#ffdbcf] leading-relaxed">
                    {block.payload?.tip || block.payload?.text || 'Hãy dùng kính ngữ phù hợp với từng đối tượng nhé!'}
                  </p>
                </div>
              </div>
            );

          case 'honorific_hint':
            return (
              <div
                key={block.id}
                className="w-full bg-[#0f4c64]/30 border border-[#9acde9]/30 rounded-2xl p-3 shadow-[0_3px_0_#001e2b] flex items-center gap-2.5"
              >
                <span className="material-symbols-outlined text-[#9acde9] text-xl shrink-0">family_restroom</span>
                <div className="flex-1 text-xs">
                  <div className="font-bold text-[#9acde9]">{block.title || 'Gợi ý xưng hô'}</div>
                  <p className="text-[#ffdbcf]">{block.payload?.suggestion}</p>
                </div>
              </div>
            );

          case 'dialect_compare':
            return (
              <div
                key={block.id}
                className="w-full bg-[#3c241b] border border-[#f8bc4b]/20 rounded-2xl p-3 shadow-[0_3px_0_#1c0904]"
              >
                <div className="font-bold text-xs text-[#f8bc4b] mb-2">{block.title || 'Đối chiếu từ vựng'}</div>
                <div className="grid grid-cols-3 gap-1 text-center text-xs">
                  <div className="bg-[#301a12] p-1.5 rounded-lg">
                    <span className="text-[10px] text-[#94a3b8] block">Bắc</span>
                    <strong className="text-white">{block.payload?.north || 'Cái bát'}</strong>
                  </div>
                  <div className="bg-[#301a12] p-1.5 rounded-lg">
                    <span className="text-[10px] text-[#94a3b8] block">Trung</span>
                    <strong className="text-white">{block.payload?.central || 'Cái đọi'}</strong>
                  </div>
                  <div className="bg-[#301a12] p-1.5 rounded-lg">
                    <span className="text-[10px] text-[#94a3b8] block">Nam</span>
                    <strong className="text-white">{block.payload?.south || 'Cái chén'}</strong>
                  </div>
                </div>
              </div>
            );

          default:
            return (
              <div key={block.id} className="bg-[#301a12] p-2.5 rounded-xl text-xs text-[#dec0bc] border border-white/5">
                <span className="font-bold text-[#ffb4aa]">{block.title}</span>
                <pre className="text-[10px] overflow-auto mt-1">{JSON.stringify(block.payload, null, 2)}</pre>
              </div>
            );
        }
      })}
    </div>
  );
};
