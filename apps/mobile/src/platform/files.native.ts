import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

export interface PickedFile {
  name: string;
  size: number;
  read(): Promise<Uint8Array>;
}

/** Selettore di file su Android: il file viene copiato nella cache dell'app e letto da lì. Non verificato su dispositivo. */
export async function pickFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'text/plain', 'text/markdown'],
    copyToCacheDirectory: true,
  });
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return null;
  const file = new File(asset.uri);
  return { name: asset.name, size: asset.size ?? file.size, read: () => file.bytes() };
}
