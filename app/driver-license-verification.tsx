import { useRouter } from 'expo-router';
import { useEffect } from 'react';

/** Legacy demo screen — redirects to real driver onboarding. */
export default function LegacyDriverLicenseRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (__DEV__) {
      console.warn('[YOO] Legacy driver-license-verification redirected to /driver-onboarding');
    }
    router.replace('/driver-onboarding');
  }, [router]);

  return null;
}
