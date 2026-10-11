import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Database } from '@/types/db';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Without both env vars the app runs on its local fixture stores (dev mode) and
// never calls this client; it is still constructed so imports stay static.
export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient<Database>(url || 'http://127.0.0.1:1', anonKey || 'not-configured', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: supabaseConfigured,
    persistSession: supabaseConfigured,
    detectSessionInUrl: false,
    // PKCE is the recommended flow for native OAuth (Google/Apple via the browser).
    flowType: 'pkce',
  },
});

export type { Database, Profile } from '@/types/db';
