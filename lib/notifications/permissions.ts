import {
  IosAuthorizationStatus,
  type NotificationPermissionsStatus,
} from 'expo-notifications';

type GenericPermissionFields = {
  granted?: boolean;
  status?: string;
};

export function canSendNotifications(
  permissions: NotificationPermissionsStatus
): boolean {
  const generic = permissions as NotificationPermissionsStatus & GenericPermissionFields;
  if (generic.granted === true || generic.status === 'granted') return true;

  return (
    permissions.ios?.status === IosAuthorizationStatus.AUTHORIZED ||
    permissions.ios?.status === IosAuthorizationStatus.PROVISIONAL ||
    permissions.ios?.status === IosAuthorizationStatus.EPHEMERAL
  );
}
