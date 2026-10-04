# HƯỚNG DẪN CHI TIẾT TECH STACK: AI, DATABASE & SAAS CORE
**Dự án:** Agentic Vietnamese Learning (Học tiếng Việt cùng Bé Cu Tít)  
**Tài liệu dành cho:** Đội ngũ phát triển (Lead Dev, Backend, Frontend, Fullstack)  
**Ngày cập nhật:** 04/10/2026  

---

## 1. Đánh giá hiện trạng tài liệu đã có

Trong các tài liệu trước (`02_Bao_cao_ky_thuat_TDD_UIT.pdf` và tệp thiết kế kiến trúc):
* **Đã có:** Ma trận năng lực kiến trúc (STT, TTS, LLM, Vision), interface trừu tượng (`SttProvider`, `TtsProvider`, `LlmProvider`), sơ đồ quan hệ và mô hình dữ liệu bảng.
* **Chưa có:** 
  1. Các **đường dẫn chính thức (Official Documentation URLs)** đến từng dịch vụ.
  2. Tên **thư viện npm/SDK cụ thể** và câu lệnh cài đặt (`pnpm add ...`).
  3. Đoạn mã mẫu (**Code Snippets**) thể hiện cách gọi API thực tế (Streaming SSE, JSON Schema, Chunked Audio).
  4. Hướng dẫn thiết lập **Database (PostgreSQL + Drizzle ORM)** và **Redis Cache / Quota**.
  5. Mẫu cấu hình biến môi trường chuẩn (**`.env.example`**).

Tài liệu này được biên soạn để **bổ sung toàn bộ các phần còn thiếu** nêu trên, giúp các thành viên trong đội có thể cài đặt, cấu hình và chạy thử nghiệm (Spike) ngay lập tức mà không cần tự tìm kiếm rời rạc.

---

## 2. Tech Stack Trí Tuệ Nhân Tạo (AI Services)

### 2.1 Large Language Model (LLM) - Trò chuyện, Sinh bài tập, Chấm Rubric
Hệ thống sử dụng mô hình kết hợp: **1 mô hình chính (Gemini 1.5 Flash)** tối ưu tốc độ/chi phí và **1 mô hình dự phòng (GPT-4o-mini)**.

| Thành phần | Công nghệ / Dịch vụ | Gói cài đặt (NPM) | Tài liệu chính thức |
| :--- | :--- | :--- | :--- |
| **Mô hình chính** | **Google Gemini 1.5 Flash** | `@google/genai` hoặc `@google/generative-ai` | [Gemini API Docs](https://ai.google.dev/gemini-api/docs) · [Structured Outputs](https://ai.google.dev/gemini-api/docs/structured-outputs) |
| **Mô hình dự phòng** | **OpenAI GPT-4o-mini** | `openai` | [OpenAI Text Generation](https://platform.openai.com/docs/guides/text-generation) · [Streaming Docs](https://platform.openai.com/docs/api-reference/chat/create#chat-create-stream) |

#### Câu lệnh cài đặt:
```bash
pnpm add @google/genai openai zod
```

#### Mã mẫu gọi Gemini với JSON Schema (Sinh bài tập Drill):
```typescript
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateDrillCard(topic: string, level: number) {
  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
    contents: `Tạo 1 bài tập trắc nghiệm tiếng Việt về chủ đề ${topic} cho trình độ CEFR A${level}.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          correctIndex: { type: Type.INTEGER },
          explanation: { type: Type.STRING },
        },
        required: ["question", "options", "correctIndex", "explanation"],
      },
    },
  });

  return JSON.parse(response.text);
}
```

---

### 2.2 Speech-to-Text (STT Tiếng Việt) - Nhận dạng giọng nói
Chuyển đổi âm thanh ghi âm từ học viên (PCM 16 kHz WAV) thành văn bản để gửi tiếp cho LLM.

| Ứng viên | Gói cài đặt (NPM) | Đặc tả kỹ thuật | Tài liệu chính thức |
| :--- | :--- | :--- | :--- |
| **Google Cloud STT (Khuyên dùng)** | `@google-cloud/speech` | Model `chirp_2` hoặc `latest_long`, mã ngôn ngữ `vi-VN`, hỗ trợ mốc thời gian từng từ | [Google Speech-to-Text Docs](https://cloud.google.com/speech-to-text/docs) |
| **Azure Speech STT** | `microsoft-cognitiveservices-speech-sdk` | Hỗ trợ nhận dạng liên tục và chấm phát âm (Pronunciation Assessment) | [Azure Speech-to-Text Docs](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-to-text) |
| **VBEE STT** | Gọi trực tiếp REST API qua `axios` | Chuyên biệt hóa giọng người Việt và các phương ngữ địa phương | [VBEE Developer Portal](https://vbee.vn/) |

#### Câu lệnh cài đặt:
```bash
pnpm add @google-cloud/speech
```

#### Mã mẫu Adapter Google Cloud STT:
```typescript
import speech from "@google-cloud/speech";

const client = new speech.SpeechClient();

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const request = {
    audio: { content: audioBuffer.toString("base64") },
    config: {
      encoding: "LINEAR16" as const,
      sampleRateHertz: 16000,
      languageCode: "vi-VN",
      enableWordTimeOffsets: true,
    },
  };

  const [response] = await client.recognize(request);
  const transcription = response.results
    ?.map(result => result.alternatives?.[0].transcript)
    .join("\n");
    
  return transcription || "";
}
```

---

### 2.3 Text-to-Speech (TTS Tiếng Việt 3 Miền) - Tổng hợp giọng nói
Cung cấp giọng nói phát âm chuẩn bản xứ theo 3 miền Bắc - Trung - Nam, hỗ trợ điều chỉnh tốc độ từ 0.75x đến 1.25x.

| Nhà cung cấp | Giọng đọc (Voice IDs) | Đặc tả vùng miền | Tài liệu chính thức |
| :--- | :--- | :--- | :--- |
| **Azure Neural TTS (Chính)** | `vi-VN-HoaiMyNeural` (Nữ Bắc)<br>`vi-VN-NamMinhNeural` (Nam Bắc)<br>`vi-VN-ThiHaNeural` (Nữ Trung - Huế)<br>`vi-VN-PhuongNhiNeural` (Nữ Nam) | Hỗ trợ SSML tùy chỉnh cao độ, ngắt nghỉ, tốc độ | [Azure TTS Voices List](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts#supported-languages) |
| **Google Cloud TTS (Dự phòng)** | `vi-VN-Neural2-A` (Nữ)<br>`vi-VN-Neural2-D` (Nam)<br>`vi-VN-Wavenet-A` | Chất lượng cao, hỗ trợ chuẩn SSML | [Google TTS Voices Docs](https://cloud.google.com/text-to-speech/docs/voices) |
| **VBEE AIVoice (Nội địa)** | `hn_female_thutrang`<br>`sg_male_minhhoang`<br>`hue_female_huonggiang` | Giọng địa phương tự nhiên, có ngữ điệu dân gian | [VBEE Voice Demo](https://vbee.vn/) |

#### Câu lệnh cài đặt:
```bash
pnpm add microsoft-cognitiveservices-speech-sdk
```

---

### 2.4 Vision AI (AR Camera - Quán nước gốc đa) - Nhận diện đồ vật đời thực
Sử dụng mô hình thị giác đa phương thức (Multimodal LLM) để gắn nhãn từ vựng tiếng Việt lên hình ảnh chụp từ camera.

* **Công nghệ sử dụng:** Gemini 1.5 Flash Multimodal Vision (nhận ảnh Base64/JPEG và trả về danh sách từ vựng + nhãn tiếng Anh + tọa độ bounding box nếu có).
* **Tài liệu hướng dẫn:** [Gemini Multimodal Vision Docs](https://ai.google.dev/gemini-api/docs/vision)

---

## 3. Tech Stack Database & Hạ Tầng SaaS Core

### 3.1 Cơ sở dữ liệu chính (PostgreSQL + Drizzle ORM)
* **Hệ quản trị CSDL:** PostgreSQL v15+ (Lưu trữ `users`, `sessions`, `messages`, `srs_cards`, `attempts`).
* **Giải pháp Hosting đề xuất:** [Supabase](https://supabase.com/docs) (bao gồm sẵn Auth, Postgres, Storage) hoặc [Neon Postgres Serverless](https://neon.tech/docs).
* **ORM:** **Drizzle ORM** (Type-safe, nhẹ hơn Prisma gấp nhiều lần, thời gian khởi động gần như tức thì, rất phù hợp với Fastify Serverless).

#### Câu lệnh cài đặt:
```bash
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit @types/pg
```

#### Cấu hình Schema Drizzle (`packages/contracts/src/schema.ts`):
```typescript
import { pgTable, uuid, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  targetDialect: text("target_dialect").default("north"), // north, central, south
  level: integer("level").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

export const srsCards = pgTable("srs_cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  itemRef: text("item_ref").notNull(), // từ vựng hoặc mẫu câu
  ease: integer("ease").default(250), // 2.5 * 100
  intervalDays: integer("interval_days").default(1),
  repetitions: integer("repetitions").default(0),
  dueAt: timestamp("due_at").notNull(),
});
```

* **Tài liệu Drizzle ORM:** [https://orm.drizzle.team/docs/overview](https://orm.drizzle.team/docs/overview)

---

### 3.2 Bộ nhớ đệm & Kiểm soát Hạn mức (Redis / Rate Limiting)
* **Công dụng:** Quản lý giới hạn Quota người dùng trong ngày (chống spam làm đội chi phí API LLM/TTS), lưu tạm session token và trạng thái Audio Worklet.
* **Thư viện:** `ioredis` kết hợp plugin Fastify `@fastify/rate-limit`.
* **Dịch vụ Cloud khuyên dùng:** [Upstash Redis](https://upstash.com/docs/redis/overall/getstarted) (Serverless Redis miễn phí tier đầu, có sẵn REST API).

#### Câu lệnh cài đặt:
```bash
pnpm add ioredis @fastify/rate-limit
```

* **Tài liệu Fastify Rate Limit:** [https://github.com/fastify/fastify-rate-limit](https://github.com/fastify/fastify-rate-limit)
* **Tài liệu ioredis:** [https://ioredis.readthedocs.io/](https://ioredis.readthedocs.io/)

---

### 3.3 Lưu trữ Tệp Âm thanh (Object Storage S3-Compatible)
* **Công dụng:**
  1. **TTS Cache Proxy:** Lưu file âm thanh `.mp3` đã sinh (khóa băm từ `text + voiceId + speed`), giúp lần gọi sau không tốn tiền API.
  2. **Learner Audio:** Lưu file ghi âm giọng nói của người học với chính sách hết hạn tự động (TTL 30 ngày).
* **Dịch vụ đề xuất:** 
  * [Cloudflare R2](https://developers.cloudflare.com/r2/) (Chuẩn S3 API, **0 đồng chi phí truyền tải Egress bandwidth** - cực kỳ tiết kiệm cho ứng dụng nghe âm thanh liên tục).
  * Hoặc Supabase Storage ([Supabase Storage Docs](https://supabase.com/docs/guides/storage)).

#### Câu lệnh cài đặt:
```bash
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

---

### 3.4 Web Framework Gateway (Fastify + TypeScript)
Fastify có hiệu năng xử lý I/O cao gấp 3-4 lần so với Express, hỗ trợ tốt luồng Server-Sent Events (SSE) để truyền dữ liệu trực tiếp về Client.

#### Câu lệnh cài đặt:
```bash
pnpm add fastify @fastify/cors @fastify/sensible fastify-type-provider-zod zod
```

* **Tài liệu Fastify:** [https://fastify.dev/docs/latest/](https://fastify.dev/docs/latest/)
* **Tài liệu Fastify Zod Integration:** [https://github.com/turkerdev/fastify-type-provider-zod](https://github.com/turkerdev/fastify-type-provider-zod)

---

### 3.5 Thu âm & Xử lý Âm thanh phía Client (Web Audio API & DSP)
* **Web Audio Worklet:** Bắt âm thanh 16 kHz trực tiếp trong luồng âm thanh riêng biệt, không giật lag giao diện.
* **Tài liệu MDN AudioWorklet:** [https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
* **Giải thuật cao độ F0:** Thuật toán YIN (YIN pitch tracking) mã nguồn mở JavaScript: [https://github.com/ashok-khanna/pitch-detection](https://github.com/ashok-khanna/pitch-detection)

---

## 4. Mẫu Tệp Cấu Hình Môi Trường Chuẩn (`.env.example`)

Đội ngũ có thể copy mẫu này vào file `.env` tại thư mục `apps/gateway`:

```env
# ==========================================
# CẤU HÌNH CỔNG GATEWAY & MÔI TRƯỜNG
# ==========================================
NODE_ENV=development
PORT=4000
HOST=0.0.0.0
CORS_ORIGIN=http://localhost:3000,http://localhost:5173

# ==========================================
# CƠ SỞ DỮ LIỆU & CACHE
# ==========================================
# PostgreSQL (Supabase hoặc Neon)
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/vietlearning?sslmode=require

# Redis (Upstash hoặc Local Redis)
REDIS_URL=redis://default:[PASSWORD]@[HOST]:6379

# ==========================================
# S3 / CLOUDFLARE R2 OBJECT STORAGE (TTS CACHE)
# ==========================================
S3_ENDPOINT=https://[ACCOUNT_ID].r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=your_access_key_id
S3_SECRET_ACCESS_KEY=your_secret_access_key
S3_BUCKET_NAME=viet-learning-audio
S3_PUBLIC_DOMAIN=https://audio.vietlearning.app

# ==========================================
# NHÀ CUNG CẤP TRÍ TUỆ NHÂN TẠO (AI PROVIDERS)
# ==========================================
# 1. Google AI (Gemini 1.5 Flash LLM & Vision)
GEMINI_API_KEY=AIzaSy...

# 2. OpenAI (Dự phòng Fallback cho LLM)
OPENAI_API_KEY=sk-proj-...

# 3. Azure Cognitive Speech (STT & Neural TTS 3 miền)
AZURE_SPEECH_KEY=your_azure_speech_key
AZURE_SPEECH_REGION=southeastasia

# 4. Google Cloud Speech-to-Text (vi-VN)
GOOGLE_APPLICATION_CREDENTIALS=./gcp-key.json

# 5. VBEE TTS (Giọng địa phương tiếng Việt - Tùy chọn)
VBEE_APP_ID=your_vbee_app_id
VBEE_API_KEY=your_vbee_api_key

# ==========================================
# GIỚI HẠN QUOTA & BẢO MẬT HỌC VIÊN (PER DAY)
# ==========================================
MAX_STT_SECONDS_PER_DAY=600     # 10 phút nói/ngày
MAX_TTS_CHARS_PER_DAY=15000     # 15.000 ký tự nghe/ngày
MAX_LLM_TOKENS_PER_DAY=100000   # 100.000 token/ngày
AUDIO_TTL_DAYS=30               # Xóa file thu âm sau 30 ngày
```

---

## 5. Check-list Kỹ Thuật Dành Cho Từng Thành Viên Trong Nhóm

Theo phân công trong mục 14 của tài liệu TDD:

* **Thành viên M1 (Backend / Gateway & Nền tảng):**
  - [ ] Khởi tạo Fastify server với Zod type provider và rate limiting.
  - [ ] Cài đặt Drizzle ORM và kết nối tới PostgreSQL (Supabase/Neon).
  - [ ] Cài đặt ioredis và triển khai Quota Counter theo ngày.
  - [ ] Hiện thực `SttProviderAdapter` (Google Cloud STT) và `TtsProviderAdapter` (Azure Speech).
  - [ ] Hiện thực luồng Server-Sent Events (SSE) tại `/v1/chat/turn`.
* **Thành viên M2 (Fullstack / Học tập & Nội dung):**
  - [ ] Hiện thực thuật toán SM-2 (`A4`) trong `packages/shared/src/srs/`.
  - [ ] Cấu hình Gemini prompt sinh bài tập (`packages/prompts/`) với JSON Schema.
  - [ ] Xây dựng bộ luật đại từ xưng hô A6 dạng JSON và bảng phương ngữ 3 miền A7.
* **Thành viên M3 (Frontend / Host Shell & Hội thoại):**
  - [ ] Thiết lập Module Federation trên Vite/Rspack với `@module-federation/vite`.
  - [ ] Xây dựng `useRecorder` hook thu âm PCM 16kHz qua AudioWorklet.
  - [ ] Cài đặt Agent UI Registry để phân giải các khối UI động từ luồng SSE.
* **Thành viên M4 (Frontend / Luyện tập & Người học):**
  - [ ] Xây dựng component bài tập thích ứng (5 dạng thẻ bài) trong `mfe-practice`.
  - [ ] Xây dựng màn hình ghép câu Sentence Builder với tính năng kéo-thả token và Undo.
  - [ ] Xây dựng giao diện Vườn cây tri thức SRS.
* **Thành viên M5 (Frontend / Âm thanh & Thị giác):**
  - [ ] Đóng gói thuật toán trích xuất F0 (YIN/McLeod) trong Web Worker (`packages/audio-dsp`).
  - [ ] Vẽ biểu đồ Canvas/SVG trực quan hóa đường cong cao độ của 6 thanh tiếng Việt (M2).
  - [ ] Hiện thực module Camera AR (`mfe-vision`) bắt khung hình gửi về `/v1/vision/label`.
