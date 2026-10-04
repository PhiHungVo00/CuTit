/**
 * GoF Flyweight Pattern (12)
 * Chia sẻ dữ liệu tĩnh của đường contour 6 thanh điệu tiếng Việt, tránh cấp phát lặp lại
 */
export class PitchReferenceFlyweight {
  private static contours: Record<string, number[]> = {
    ngang: [150, 150, 150, 150],
    huyen: [150, 140, 130, 120],
    sac:   [130, 145, 160, 175],
    hoi:   [140, 125, 135, 150],
    nga:   [135, 160, 140, 170],
    nang:  [130, 115, 100, 90]
  };

  public static getReference(toneName: string): number[] {
    return this.contours[toneName] || this.contours['ngang'];
  }
}
