import { Alert, Linking, Platform } from 'react-native';

export function openMapsNavigation(
  lat: number,
  lng: number,
  label?: string,
  onUnavailable?: (message: string) => void,
) {
  const dest = `${lat},${lng}`;
  const encodedLabel = encodeURIComponent(label ?? 'Destination');
  const url =
    Platform.OS === 'ios'
      ? `maps://?daddr=${dest}&q=${encodedLabel}`
      : `google.navigation:q=${dest}`;
  const webFallback = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;

  Linking.canOpenURL(url)
    .then((supported) => {
      if (supported) return Linking.openURL(url);
      return Linking.openURL(webFallback);
    })
    .catch(() => {
      const msg = 'Unable to open maps on this device.';
      if (onUnavailable) onUnavailable(msg);
      else Alert.alert('Navigation', msg);
    });
}
