import type { RgbaImage } from '../types';

export type ImageIssue = 'too_small' | 'too_dark' | 'too_bright' | 'low_contrast' | 'blurry';

const MIN_SIDE = 160;

/**
 * Decide se una foto è leggibile prima di passarla al modello visivo.
 * Soglie volutamente larghe: scartano solo i casi evidenti, da tarare con foto reali.
 */
export function checkImageQuality(image: RgbaImage): ImageIssue[] {
  if (image.width < MIN_SIDE || image.height < MIN_SIDE) return ['too_small'];

  // Luminanza su una griglia 64x64: basta per esposizione, contrasto e nitidezza.
  const grid = 64;
  const luma = new Float32Array(grid * grid);
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const x = Math.min(image.width - 1, Math.floor(((gx + 0.5) * image.width) / grid));
      const y = Math.min(image.height - 1, Math.floor(((gy + 0.5) * image.height) / grid));
      const offset = (y * image.width + x) * 4;
      luma[gy * grid + gx] =
        0.299 * (image.data[offset] ?? 0) + 0.587 * (image.data[offset + 1] ?? 0) + 0.114 * (image.data[offset + 2] ?? 0);
    }
  }

  let sum = 0;
  for (const value of luma) sum += value;
  const mean = sum / luma.length;
  let variance = 0;
  for (const value of luma) variance += (value - mean) ** 2;
  const deviation = Math.sqrt(variance / luma.length);

  const issues: ImageIssue[] = [];
  if (mean < 35) issues.push('too_dark');
  else if (mean > 225) issues.push('too_bright');
  if (deviation < 12) issues.push('low_contrast');

  // Nitidezza: media del gradiente tra punti vicini. Una foto sfocata non ha bordi netti.
  if (issues.length === 0) {
    let gradient = 0;
    let count = 0;
    for (let gy = 0; gy < grid - 1; gy++) {
      for (let gx = 0; gx < grid - 1; gx++) {
        const here = luma[gy * grid + gx] ?? 0;
        gradient += Math.abs(here - (luma[gy * grid + gx + 1] ?? 0)) + Math.abs(here - (luma[(gy + 1) * grid + gx] ?? 0));
        count += 2;
      }
    }
    if (gradient / count < 2.5) issues.push('blurry');
  }
  return issues;
}
