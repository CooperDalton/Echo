import { Platform } from 'react-native';

import type { NotesState } from '@/lib/notes/types';
import EchoWidget from '@/widgets/EchoWidget';
import { createEchoWidgetProps } from '@/lib/widgets/entries';

export function updateEchoWidget(state: NotesState): void {
  if (Platform.OS !== 'ios') return;

  try {
    EchoWidget.updateSnapshot(createEchoWidgetProps(state));
  } catch {
    // Widgets are unavailable in Expo Go and some non-widget dev contexts.
  }
}
