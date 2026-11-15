import { useRouter } from 'expo-router';
import InviteScreen from '../../src/features/referrals/InviteScreen';

export default function InviteRoute() {
  const router = useRouter();
  return <InviteScreen onBack={() => (router.canGoBack() ? router.back() : router.replace('/you'))} />;
}
