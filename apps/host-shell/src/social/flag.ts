/**
 * Lối vào tin nhắn (dòng ở Hồ sơ, chấm đỏ) chỉ hiện khi build bật `VITE_CHAT_ENABLED=true`, hoặc khi chạy dev/test.
 * Production mặc định TẮT (cờ máy chủ CHAT_ENABLED cũng mặc định false): bật cùng lúc sau Task 17 + 19.
 * Tách tệp riêng để gói đầu không kéo client vào.
 */
export const SOCIAL_ENTRY_ENABLED: boolean = import.meta.env.VITE_CHAT_ENABLED === 'true' || !import.meta.env.PROD;
