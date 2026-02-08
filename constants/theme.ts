/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#2E4C47';
const tintColorDark = '#F2E9DD';

export const Colors = {
  light: {
    text: '#1F1B16',
    background: '#F7F2EA',
    surface: '#FFFFFF',
    surfaceAlt: '#EFE6DA',
    border: '#E1D6C7',
    muted: '#6E675F',
    tint: tintColorLight,
    accent: '#2E4C47',
    accentSoft: '#D7E3D8',
    icon: '#5E5A55',
    tabIconDefault: '#6F6A64',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#F2E9DD',
    background: '#1B1916',
    surface: '#26221D',
    surfaceAlt: '#2F2A24',
    border: '#3A342C',
    muted: '#A8A195',
    tint: tintColorDark,
    accent: '#BFD0C3',
    accentSoft: '#2C3A34',
    icon: '#C2BAB0',
    tabIconDefault: '#A69F94',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
