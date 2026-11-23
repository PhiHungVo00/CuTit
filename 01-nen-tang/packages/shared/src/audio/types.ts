/** Kiểu cài đặt âm thanh dùng chung (điều phối âm thanh ở Task 3 sẽ bổ sung phần còn lại). */
export type MusicTrack = 'sang-lang' | 'chieu-dong' | 'trau-ve';
export type MusicChoice = 'rotate' | MusicTrack;

export interface AudioSettings {
  sfx: boolean;
  haptics: boolean;
  music: boolean;
  musicTrack: MusicChoice;
  /** 0..1 */
  musicVolume: number;
}
