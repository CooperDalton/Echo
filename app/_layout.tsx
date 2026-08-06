import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { ReflectionPromptCoordinator } from '@/components/reflection-prompt-coordinator';
import { NotesProvider } from '@/context/notes-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { canUseEchoWidget } from '@/lib/widgets/availability';

export const unstable_settings = {
  anchor: '(tabs)',
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function NotificationRouter() {
  const router = useRouter();
  const lastNotificationResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    const url = lastNotificationResponse?.notification.request.content.data?.url;
    if (url === '/checkin' || url === '/checkin-flow') {
      router.push('/checkin-flow' as never);
      return;
    }
    if (url === '/weekly-review') {
      router.push({ pathname: '/weekly-review', params: { source: 'notification' } });
    }
  }, [lastNotificationResponse, router]);

  return null;
}

function routeDeepLink(url: string, router: ReturnType<typeof useRouter>) {
  const parsed = Linking.parse(url);
  const parts = [parsed.hostname, ...(parsed.path ?? '').split('/')].filter(
    (part): part is string => Boolean(part)
  );
  const [kind, id] = parts;
  if (!id) return;

  if (kind === 'note') {
    router.push({ pathname: '/note/[noteId]', params: { noteId: id } });
    return;
  }

  if (kind === 'standing') {
    router.push({ pathname: '/standing/[standingMessageId]', params: { standingMessageId: id } });
  }
}

function DeepLinkRouter() {
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    void Linking.getInitialURL().then((url) => {
      if (url) routeDeepLink(url, router);
    });

    const linkSubscription = Linking.addEventListener('url', (event) => {
      routeDeepLink(event.url, router);
    });

    let widgetSubscription: { remove: () => void } | null = null;
    if (canUseEchoWidget()) {
      void import('expo-widgets')
        .then(({ addUserInteractionListener }) => {
          if (!isMounted) return;
          widgetSubscription = addUserInteractionListener((event: { target: string }) => {
            routeDeepLink(event.target, router);
          });
        })
        .catch(() => {
          // Widgets are unavailable in some non-widget dev contexts.
        });
    }

    return () => {
      isMounted = false;
      linkSubscription.remove();
      widgetSubscription?.remove();
    };
  }, [router]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <NotesProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="checkin-flow" options={{ headerShown: false }} />
          <Stack.Screen
            name="weekly-review"
            options={{ headerShown: false, presentation: 'modal' }}
          />
          <Stack.Screen name="standing/[standingMessageId]" options={{ headerShown: false }} />
        </Stack>
        <NotificationRouter />
        <DeepLinkRouter />
        <ReflectionPromptCoordinator />
        <StatusBar style="auto" />
      </ThemeProvider>
    </NotesProvider>
  );
}
