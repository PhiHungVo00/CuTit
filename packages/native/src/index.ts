export { getDeviceSpeech, isNativePlatform, SpeechError } from './speech.js';
export type { DeviceSpeech, SpeakOptions, SpeechErrorCode } from './speech.js';
export { canOpenAppSettings, openAppSettings } from './settings.js';
export { getLocalReminders, REMINDER_IDS } from './reminders.js';
export type { LocalReminders, ReminderItem } from './reminders.js';
export {
  CameraError,
  MAX_BASE64_CHARS,
  MAX_SIDE,
  capturePhoto,
  encodeUnderLimit,
  fileToJpegBase64,
  fitWithin,
  grabFrame,
  openPreview,
  toCameraError,
  toJpegBase64,
} from './camera.js';
export type { CameraErrorCode, CapturedImage } from './camera.js';
export { getAudioEnv } from './audioEnv.js';
export type { AudioEnvBridge } from './audioEnv.js';
