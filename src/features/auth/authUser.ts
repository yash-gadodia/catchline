import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

// Who the backend session is: anonymous (the default) or signed in with Apple.
// The display name is the Apple-given name kept in profiles.display_name.
export type AuthUser = { userId: string | null; anonymous: boolean; displayName: string | null };

export const NO_USER: AuthUser = { userId: null, anonymous: true, displayName: null };

export const useAuthUser = create<AuthUser>(() => NO_USER);

export async function syncAuthUser(session: Session | null): Promise<void> {
  if (!session || session.user.is_anonymous) {
    useAuthUser.setState({ userId: session?.user.id ?? null, anonymous: true, displayName: null });
    return;
  }
  const { data } = await supabase.from('profiles').select('display_name').eq('id', session.user.id).maybeSingle();
  useAuthUser.setState({ userId: session.user.id, anonymous: false, displayName: data?.display_name ?? null });
}

export function startAuthUserSync(): () => void {
  supabase.auth.getSession().then(({ data }) => syncAuthUser(data.session)).catch(() => undefined);
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    syncAuthUser(session).catch(() => undefined);
  });
  return () => data.subscription.unsubscribe();
}
