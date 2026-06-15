import type { NotesState } from '@/lib/notes/types';
import { canUseEchoWidget } from '@/lib/widgets/availability';
import { createEchoWidgetProps } from '@/lib/widgets/entries';

export function updateEchoWidget(state: NotesState): void {
  if (!canUseEchoWidget()) return;

  void import('@/widgets/EchoWidget')
    .then(({ default: EchoWidget }) => {
      EchoWidget.updateSnapshot(createEchoWidgetProps(state));
    })
    .catch(() => {
      // Widgets are unavailable in Expo Go and some non-widget dev contexts.
    });
}
