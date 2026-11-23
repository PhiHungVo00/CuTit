import type { FastifyRequest } from 'fastify';
import { AUDIO_UPLOAD_MIME_TYPES, AudioUploadFieldsSchema, type AudioUploadFields } from '@vietlearning/contracts';
import { readWavInfo } from '@vietlearning/audio-dsp';
import { GatewayError } from '../pipeline/RequestPipeline.js';

export interface AudioUpload {
  bytes: Buffer;
  mimetype: string;
  fields: AudioUploadFields;
  /** thời lượng (giây) dùng để trừ quota STT; WAV đọc chính xác từ header, định dạng nén thì ước lượng */
  durationSec: number;
}

/** Opus/Vorbis giọng nói ~32 kbps ≈ 4 KB/giây: ước lượng thời lượng khi không đọc được header */
const COMPRESSED_BYTES_PER_SEC = 4000;
const MAX_DURATION_SEC = 60;

/**
 * Đọc âm thanh tải lên dạng multipart/form-data (phần file tên "audio" + các trường text).
 * Từ chối sớm: sai định dạng (415), thiếu file/trường sai (400), WAV hỏng (400), quá dài (413).
 */
export async function readAudioUpload(req: FastifyRequest): Promise<AudioUpload> {
  if (!req.isMultipart()) throw new GatewayError(415, 'expected_multipart', 'Gửi âm thanh dạng multipart/form-data');

  let file: { bytes: Buffer; mimetype: string } | null = null;
  const rawFields: Record<string, string> = {};
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      if (part.fieldname !== 'audio' || file) {
        await part.toBuffer(); // tiêu thụ luồng thừa
        continue;
      }
      const mimetype = part.mimetype.split(';')[0].trim().toLowerCase();
      if (!(AUDIO_UPLOAD_MIME_TYPES as readonly string[]).includes(mimetype)) {
        throw new GatewayError(415, 'unsupported_audio_type', `Không hỗ trợ ${mimetype}`);
      }
      file = { bytes: await part.toBuffer(), mimetype };
    } else if (typeof part.value === 'string') {
      rawFields[part.fieldname] = part.value;
    }
  }
  if (!file || file.bytes.length === 0) throw new GatewayError(400, 'missing_audio', 'Thiếu phần file "audio"');

  const parsed = AudioUploadFieldsSchema.safeParse(rawFields);
  if (!parsed.success) throw new GatewayError(400, 'invalid_request', parsed.error.issues.map((i) => i.message).join('; '));

  let durationSec: number;
  if (file.mimetype.includes('wav') || file.mimetype === 'audio/wave') {
    const info = readWavInfo(new Uint8Array(file.bytes.buffer, file.bytes.byteOffset, file.bytes.byteLength));
    if (!info) throw new GatewayError(400, 'invalid_wav', 'File WAV không hợp lệ (cần PCM)');
    durationSec = info.durationSec;
  } else {
    durationSec = file.bytes.length / COMPRESSED_BYTES_PER_SEC;
  }
  if (durationSec > MAX_DURATION_SEC) throw new GatewayError(413, 'audio_too_long', `Tối đa ${MAX_DURATION_SEC} giây`);

  return { ...file, fields: parsed.data, durationSec };
}
