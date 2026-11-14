import { useColorScheme } from 'nativewind';

/** Colore delle icone coerente col tema: le icone SVG non leggono le variabili CSS. */
export function useIconColor(): string {
  return useColorScheme().colorScheme === 'dark' ? '#e9ebe6' : '#1b221e';
}
