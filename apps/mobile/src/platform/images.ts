import type { RgbaImage } from '@survivapp/core';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import jpeg from 'jpeg-js';

export interface PickedImage {
  uri: string;
}

/** Apre fotocamera o galleria. Il permesso della fotocamera si chiede solo qui, al momento dell'uso. */
export async function pickImage(source: 'camera' | 'library'): Promise<PickedImage | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return null;
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9 };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets?.[0];
  return asset ? { uri: asset.uri } : null;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function toJpegBase64(uri: string, width: number, compress: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
  if (!result.base64) throw new Error('image_encoding_failed');
  return result.base64;
}

/** Pixel RGBA della foto, ridotta a 512 px di larghezza: è ciò che ricevono controlli qualità e modello visivo. */
export async function decodeImage(uri: string): Promise<RgbaImage> {
  const decoded = jpeg.decode(base64ToBytes(await toJpegBase64(uri, 512, 0.9)), { useTArray: true });
  return { width: decoded.width, height: decoded.height, data: decoded.data };
}

/** Miniatura come data URI: si salva nella cronologia senza gestire file. */
export async function thumbnailDataUri(uri: string): Promise<string> {
  return `data:image/jpeg;base64,${await toJpegBase64(uri, 256, 0.6)}`;
}
