/**
 * Hằng số luật nhóm (spec 5.6 "nhóm lớn", 6.1) — tệp riêng để `reads.ts`/`groups.ts` dùng chung mà không vòng import.
 */

/** Nhóm CÓ NHIỀU HƠN chừng này thành viên: không phát `read` từng người (chỉ "đã xem bởi N" tải lười). `typing` cùng ngưỡng ở presence.ts. */
export const GROUP_LARGE_THRESHOLD = 50;

/** Nhóm có TỪ chừng này thành viên trở lên: thông báo đẩy tắt sẵn cho từng thành viên (người dùng bật lại được). Chỉ lưu cờ (`muted_until`). */
export const GROUP_PUSH_MUTE_THRESHOLD = 200;

/** "Tắt sẵn" = tắt tiếng không hạn; người dùng bật lại bằng `PUT …/mute {mutedUntil:null}`. */
export const MUTED_FOREVER = new Date('9999-12-31T00:00:00.000Z');

/** Tối đa người thêm trong MỘT yêu cầu `addMembers` (khớp `GroupMemberChangeSchema`) */
export const GROUP_ADD_BATCH_MAX = 100;
