/**
 * GoF Abstract Factory Pattern (1)
 * Khởi tạo họ bộ điều hợp AI tương thích (STT, TTS, LLM) theo biến môi trường
 */
export interface AIProviderSuite {
  speechToText(audioData: Buffer): Promise<string>;
  generateResponse(prompt: string): Promise<string>;
  textToSpeech(text: string): Promise<Buffer>;
}

export class GoogleAISuite implements AIProviderSuite {
  async speechToText(audioData: Buffer) { return 'Nhận diện giọng nói Google STT'; }
  async generateResponse(prompt: string) { return 'Phản hồi từ Gemini 1.5 Flash'; }
  async textToSpeech(text: string) { return Buffer.from('google-tts-audio'); }
}

export class AzureAISuite implements AIProviderSuite {
  async speechToText(audioData: Buffer) { return 'Nhận diện giọng nói Azure STT'; }
  async generateResponse(prompt: string) { return 'Phản hồi từ OpenAI GPT-4o-mini'; }
  async textToSpeech(text: string) { return Buffer.from('azure-tts-audio'); }
}

export function createAIFactory(provider: 'google' | 'azure'): AIProviderSuite {
  return provider === 'google' ? new GoogleAISuite() : new AzureAISuite();
}
