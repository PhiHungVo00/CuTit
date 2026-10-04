/**
 * GoF Bridge Pattern (10)
 * Tách trừu tượng thu âm khỏi nền tảng thực thi (Web Audio API vs Capacitor Plugin)
 */
export interface AudioPlatformDriver {
  startRecording(): Promise<void>;
  stopRecording(): Promise<Blob | ArrayBuffer>;
}

export class WebAudioDriver implements AudioPlatformDriver {
  async startRecording() { /* Web AudioWorklet init */ }
  async stopRecording() { return new Blob([], { type: 'audio/wav' }); }
}

export class CapacitorAudioDriver implements AudioPlatformDriver {
  async startRecording() { /* Native Audio Recording */ }
  async stopRecording() { return new ArrayBuffer(0); }
}

export class AudioCaptureBridge {
  constructor(private driver: AudioPlatformDriver) {}

  public async record(): Promise<any> {
    await this.driver.startRecording();
  }

  public async finish(): Promise<any> {
    return await this.driver.stopRecording();
  }
}
