import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://iqkkxtiuvkaecncdutpt.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlxa2t4dGl1dmthZWNuY2R1dHB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzODg2MTMsImV4cCI6MjEwODk2NDYxM30.cpXdGxbz0ZwjsWGc0hB5__UzLb8S3cuPP5yVtL0i35o";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
