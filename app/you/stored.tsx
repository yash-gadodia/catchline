import { useRouter } from 'expo-router';
import WhatIsStoredScreen from '../../src/features/you/WhatIsStoredScreen';
import { exportMyData } from '../../src/features/you/YouScreen';

export default function StoredRoute() {
  const router = useRouter();
  return (
    <WhatIsStoredScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/you'))}
      onExport={() => exportMyData()}
    />
  );
}
