import { useColorScheme } from 'react-native';

/** Colore delle icone coerente col tema: le icone SVG non leggono le variabili CSS. */
export function useIconColor(): string {
  return useColorScheme() === 'dark' ? '#e9ebe6' : '#1b221e';
}
