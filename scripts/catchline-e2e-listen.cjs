// Realtime check: subscribes as the user to their lift, the way subscribeToLift does,
// and prints every status it receives. Exits on done/failed or after 15 min.
// Needs @supabase/supabase-js on NODE_PATH. env: API_URL, ANON_KEY, USER_JWT, LIFT_ID
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.API_URL, process.env.ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${process.env.USER_JWT}` } },
  auth: { persistSession: false },
});
sb.realtime.setAuth(process.env.USER_JWT);
const id = process.env.LIFT_ID;
const timer = setTimeout(() => {
  console.log('realtime: timed out');
  process.exit(1);
}, 15 * 60 * 1000);
sb.channel(`lift:${id}`)
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lifts', filter: `id=eq.${id}` }, (p) => {
    console.log(`realtime: lift status -> ${p.new.status}${p.new.error ? ` (${p.new.error})` : ''}`);
    if (p.new.status === 'done' || p.new.status === 'failed') {
      clearTimeout(timer);
      setTimeout(() => process.exit(0), 200);
    }
  })
  .subscribe((s) => console.log(`realtime: channel ${s}`));
