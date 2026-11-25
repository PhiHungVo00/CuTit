/**
 * Góp ý / Báo lỗi (dự án 5a, Task 3) — client của `/v1/feedback*`. Subpath `@vietlearning/api-client/feedback`
 * (lười: chỉ nạp khi mở màn Góp ý hoặc hỏi số chưa đọc).
 *
 * `submitFeedback` dùng XMLHttpRequest vì `fetch` chưa báo được tiến độ TẢI LÊN (video tới 50 MB).
 * Bearer lấy qua cấu hình Gateway hiện có; 401 => làm mới phiên rồi gửi lại ĐÚNG MỘT lần (như `request`).
 */
import {
  FeedbackCreateResponseSchema,
  MyFeedbackListSchema,
  UnreadCountSchema,
  type FeedbackCreateMeta,
  type FeedbackCreateResponse,
  type MyFeedbackList
} from '@vietlearning/contracts/api';
import { APP_BUILD_HEADER, APP_CHANNEL_HEADER } from '@vietlearning/contracts/api';
import { gatewayConfig } from './config.js';
import { GatewayRequestError, kindForStatus, request, send } from './index.js';
import { getAuthSession } from './session.js';

/** Thời gian tối đa cho cả lần tải lên (video 50 MB trên mạng yếu): 5 phút */
const UPLOAD_TIMEOUT_MS = 5 * 60_000;

function abortError(): Error {
  const e = new Error('Đã hủy');
  e.name = 'AbortError';
  return e;
}

function uploadOnce(meta: FeedbackCreateMeta, files: Blob[], onProgress: (p: number) => void, token: string | null, signal?: AbortSignal): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    // `meta` đi trước các tệp để Gateway đọc được ngay khi dòng chảy bắt đầu
    form.append('meta', JSON.stringify(meta));
    files.forEach((f, i) => form.append('files', f, `file-${i}`));

    xhr.open('POST', `${gatewayConfig().baseUrl}/v1/feedback`);
    xhr.setRequestHeader('Accept', 'application/json');
    const { appBuild, appChannel } = gatewayConfig();
    if (appBuild !== undefined) xhr.setRequestHeader(APP_BUILD_HEADER, String(appBuild));
    if (appChannel) xhr.setRequestHeader(APP_CHANNEL_HEADER, appChannel);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
    };
    const onAbort = () => xhr.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const done = () => signal?.removeEventListener('abort', onAbort);
    xhr.onload = () => {
      done();
      resolve({ status: xhr.status, text: xhr.responseText });
    };
    xhr.onerror = () => {
      done();
      reject(new GatewayRequestError('offline', 'Lỗi mạng'));
    };
    xhr.ontimeout = () => {
      done();
      reject(new GatewayRequestError('timeout', 'Hết thời gian chờ'));
    };
    xhr.onabort = () => {
      done();
      reject(abortError());
    };
    xhr.send(form);
  });
}

/**
 * POST /v1/feedback (multipart). `files`: tối đa 3 ảnh + 1 video, đã qua `prepareImage` / kiểm độ dài ở màn hình.
 * Lỗi: `offline` (rớt mạng — nơi gọi giữ nguyên chữ + tệp để "Gửi lại"), hoặc mã Gateway trong `.code`
 * (`feedback_limit` 429, `file_too_large` 413, `file_type`/`too_many_files` 400, `storage_full` 507).
 */
export async function submitFeedback(meta: FeedbackCreateMeta, files: Blob[], onProgress: (p: number) => void, signal?: AbortSignal): Promise<FeedbackCreateResponse> {
  let retried = false;
  for (;;) {
    const token = (await gatewayConfig().getToken?.()) ?? null;
    onProgress(0);
    const { status, text } = await uploadOnce(meta, files, onProgress, token, signal);
    if (status === 401 && !retried) {
      const refresh = gatewayConfig().onUnauthorized;
      if (refresh && (await refresh())) {
        retried = true;
        continue;
      }
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    if (status < 200 || status >= 300) {
      const details = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : undefined;
      const code = typeof details?.error === 'string' ? details.error : undefined;
      throw new GatewayRequestError(kindForStatus(status), `Gateway trả ${status}`, status, code, details);
    }
    const parsed = FeedbackCreateResponseSchema.safeParse(json);
    if (!parsed.success) throw new GatewayRequestError('contract', 'Phản hồi /v1/feedback lệch contract');
    return parsed.data;
  }
}

/** GET /v1/feedback/mine — góp ý của chính người gọi + lời nhắn của chủ app (không có tệp) */
export function listMyFeedback(signal?: AbortSignal): Promise<MyFeedbackList> {
  return request('/v1/feedback/mine', { schema: MyFeedbackListSchema, signal });
}

/**
 * GET /v1/feedback/mine/unread-count — số góp ý có lời nhắn chưa đọc (chấm đỏ).
 * Chưa có phiên trên máy => 0 và KHÔNG gọi mạng: hỏi chấm đỏ không được tự tạo tài khoản khách
 * (người chưa có tài khoản thì chưa thể có lời nhắn).
 */
export async function unreadFeedbackCount(signal?: AbortSignal): Promise<number> {
  if (!(await getAuthSession().info())) return 0;
  return (await request('/v1/feedback/mine/unread-count', { schema: UnreadCountSchema, signal })).count;
}

/** POST /v1/feedback/:id/read — đánh dấu đã đọc (204) */
export async function markFeedbackRead(id: string, signal?: AbortSignal): Promise<void> {
  await send(`/v1/feedback/${encodeURIComponent(id)}/read`, 'POST', undefined, signal);
}
