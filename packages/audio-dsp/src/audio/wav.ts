/**
 * Mã hóa / đọc WAV PCM 16-bit mono để tải âm thanh lên Gateway dạng nhị phân (multipart).
 * 16 kHz × 16 bit = 32 KB/giây, bằng một nửa Float32 và nhỏ hơn base64 ~33%.
 */

export function encodeWav(pcm: Float32Array, sampleRate = 16000): ArrayBuffer {
  const bytesPerSample = 2;
  const dataSize = pcm.length * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const ascii = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true); // kích thước khối fmt
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  v.setUint16(32, bytesPerSample, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  v.setUint32(40, dataSize, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataBytes: number;
  durationSec: number;
}

/**
 * Đọc header WAV (kiểm tra ở Gateway trước khi gửi cho STT trả phí và để tính quota theo giây).
 * Trả null nếu không phải WAV PCM hợp lệ.
 */
export function readWavInfo(bytes: Uint8Array): WavInfo | null {
  if (bytes.length < 44) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (off: number) => String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;

  // Duyệt các chunk để tìm "fmt " và "data" (có thể có chunk LIST... xen giữa)
  let off = 12;
  let fmt: Omit<WavInfo, 'dataBytes' | 'durationSec'> | null = null;
  while (off + 8 <= bytes.length) {
    const id = tag(off);
    const size = v.getUint32(off + 4, true);
    if (id === 'fmt ') {
      if (v.getUint16(off + 8, true) !== 1) return null; // chỉ PCM
      fmt = { channels: v.getUint16(off + 10, true), sampleRate: v.getUint32(off + 12, true), bitsPerSample: v.getUint16(off + 22, true) };
    } else if (id === 'data' && fmt) {
      const dataBytes = Math.min(size, bytes.length - off - 8);
      const bytesPerSec = fmt.sampleRate * fmt.channels * (fmt.bitsPerSample / 8);
      if (!bytesPerSec) return null;
      return { ...fmt, dataBytes, durationSec: dataBytes / bytesPerSec };
    }
    off += 8 + size + (size % 2);
  }
  return null;
}

/**
 * Giải mã WAV PCM 16-bit (mono, hoặc lấy kênh đầu nếu nhiều kênh) thành Float32 [-1, 1].
 * Gateway dùng để chạy A1/A2 trên bản ghi câu (chấm thanh từng âm tiết). Không hợp lệ => null.
 */
export function decodeWavPcm(bytes: Uint8Array): { pcm: Float32Array; sampleRate: number } | null {
  const info = readWavInfo(bytes);
  if (!info || info.bitsPerSample !== 16 || info.channels < 1) return null;
  // vị trí khối data: duyệt lại như readWavInfo
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 12;
  while (off + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
    const size = v.getUint32(off + 4, true);
    if (id === 'data') {
      const start = off + 8;
      const frameBytes = 2 * info.channels;
      const n = Math.floor(info.dataBytes / frameBytes);
      const pcm = new Float32Array(n);
      for (let i = 0; i < n; i++) pcm[i] = v.getInt16(start + i * frameBytes, true) / 0x8000;
      return { pcm, sampleRate: info.sampleRate };
    }
    off += 8 + size + (size % 2);
  }
  return null;
}

/** Bọc PCM16 little-endian mono thô (vd. đầu ra `audio/L16;rate=24000` của TTS) thành tệp WAV. */
export function pcm16ToWav(raw: Uint8Array, sampleRate: number): Uint8Array {
  const dataSize = raw.length - (raw.length % 2);
  const out = new Uint8Array(44 + dataSize);
  const v = new DataView(out.buffer);
  const ascii = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, 'data');
  v.setUint32(40, dataSize, true);
  out.set(raw.subarray(0, dataSize), 44);
  return out;
}
