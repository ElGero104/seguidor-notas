import { getSb } from "./db";

// La clave pública VAPID se lee del backend (app_secrets vía RPC);
// nunca va la privada al cliente.
let VAPID_PUBLIC_KEY = "";

async function urlBase64ToUint8Array(base64: string): Promise<Uint8Array> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function subscribeToPush(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (!VAPID_PUBLIC_KEY) {
    const { data } = await getSb().rpc("get_vapid_public_key");
    VAPID_PUBLIC_KEY = data || "";
  }
  if (!VAPID_PUBLIC_KEY) return false;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: await urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as any,
  });
  const json: any = sub.toJSON();
  const { data: s } = await getSb().auth.getSession();
  const uidUser = s?.session?.user?.id;
  if (!uidUser) return false;
  await getSb().from("push_subscriptions").upsert({
    user_id: uidUser,
    endpoint: json.endpoint,
    keys: json.keys,
  }, { onConflict: "endpoint" });
  return true;
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await getSb().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
}
const sb = () =>
  (typeof supabase !== "undefined" ? supabase : (window as any).supabase).createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    { auth: { persistSession: true, autoRefreshToken: true } }
  );
let supabaseClient: any = null;
const getSb = () => (supabaseClient ??= sb());
