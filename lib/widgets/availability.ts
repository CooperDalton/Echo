import Constants, { AppOwnership } from 'expo-constants';
import { Platform } from 'react-native';

export function canUseEchoWidget(): boolean {
  return Platform.OS === 'ios' && Constants.appOwnership !== AppOwnership.Expo && !Constants.expoGoConfig;
}
