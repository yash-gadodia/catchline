import { Redirect, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect } from 'react';
import { normalizeCode } from '../../src/features/referrals/api';
import { useInvite } from '../../src/features/referrals/store';

// catchline://invite/CODE (from the invite page): keep the code, then open Invite to claim it.
export default function InviteLinkRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const clean = normalizeCode(code ?? '');
  useEffect(() => {
    if (clean) useInvite.getState().setPendingCode(clean);
  }, [clean]);
  return <Redirect href={'/you/invite' as Href} />;
}
