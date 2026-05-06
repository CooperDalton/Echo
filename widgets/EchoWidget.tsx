import { Button, Text, VStack } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
  buttonStyle,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { EchoWidgetProps } from '@/lib/widgets/entries';

function rowLimit(family: WidgetEnvironment['widgetFamily'], index: number): number {
  if (family === 'systemSmall') return 5;
  if (family === 'systemLarge') return index === 0 ? 4 : 3;
  return 2;
}

function visibleEntries(props: EchoWidgetProps, family: WidgetEnvironment['widgetFamily']) {
  const entries = props.entries.length > 0 ? props.entries : [];
  if (family === 'systemSmall') return entries.slice(0, 1);
  return entries.slice(0, 3);
}

function EchoWidgetView(props: EchoWidgetProps, environment: WidgetEnvironment) {
  'widget';

  const isDark = environment.colorScheme === 'dark';
  const textColor = isDark ? '#F5F0E8' : '#201F1C';
  const entries = visibleEntries(props, environment.widgetFamily);

  return (
    <VStack
      alignment="leading"
      spacing={environment.widgetFamily === 'systemSmall' ? 0 : 8}
      modifiers={[padding({ all: 14 }), frame({ maxWidth: 999, maxHeight: 999, alignment: 'topLeading' })]}
    >
      {entries.map((entry, index) => {
        const text = (
          <Text
            modifiers={[
              font({ size: environment.widgetFamily === 'systemSmall' ? 15 : 14, weight: 'regular' }),
              foregroundStyle(textColor),
              lineLimit(rowLimit(environment.widgetFamily, index)),
            ]}
          >
            {entry.text}
          </Text>
        );
        return (
          <Button key={entry.id} target={entry.targetUrl ?? 'echo://noop'} modifiers={[buttonStyle('plain')]}>
            {text}
          </Button>
        );
      })}
    </VStack>
  );
}

export default createWidget<EchoWidgetProps>('EchoWidget', EchoWidgetView);
