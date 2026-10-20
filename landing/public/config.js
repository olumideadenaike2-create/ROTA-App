// Public settings for the landing page's early-access form.
// Both values are safe to publish: the publishable key can only add rows to the waitlist
// (Row Level Security in supabase/migrations/005_waitlist.sql blocks everything else).
window.TEAMROTA = {
  supabaseUrl: '',      // e.g. https://xxxx.supabase.co
  publishableKey: '',   // sb_publishable_...
  dashboardUrl: 'https://dashboard.teamrota.app',
}
