import { useRouter } from 'expo-router';
import DeleteAccountSheet from '../../src/features/you/DeleteAccountSheet';

export default function DeleteAccountRoute() {
  const router = useRouter();
  return (
    <DeleteAccountSheet
      onKeep={() => (router.canGoBack() ? router.back() : router.replace('/you'))}
      onDeleted={() => router.replace('/onboarding')}
    />
  );
}
