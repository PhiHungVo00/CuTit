/**
 * GoF Strategy Pattern (13)
 * Cho phép hoán đổi linh hoạt giải thuật trích xuất cao độ YIN hoặc McLeod tùy theo năng lực CPU
 */
export interface PitchStrategy {
  name: string;
  extractPitch(pcm: Float32Array): number[];
}

export class YINPitchStrategy implements PitchStrategy {
  name = 'YIN_PRECISION';
  extractPitch(pcm: Float32Array): number[] {
    return [150.5, 155.0, 160.2]; // Mô phỏng trích xuất YIN chính xác
  }
}

export class McLeodPitchStrategy implements PitchStrategy {
  name = 'MCLEOD_FAST';
  extractPitch(pcm: Float32Array): number[] {
    return [150.0, 154.5, 160.0]; // Mô phỏng trích xuất nhẹ cho thiết bị yếu
  }
}
