import * as DocumentPicker from 'expo-document-picker';

export interface PickedFile {
  name: string;
  size: number;
  read(): Promise<Uint8Array>;
}

/** Selettore di file nel browser: i byte si leggono dall'oggetto File solo dopo i controlli sui limiti. */
export async function pickFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'text/plain', 'text/markdown', '.md'],
    base64: false,
  });
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset?.file) return null;
  const file = asset.file;
  return { name: asset.name, size: file.size, read: async () => new Uint8Array(await file.arrayBuffer()) };
}
