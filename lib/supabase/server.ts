import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // In Server Components nicht erlaubt – der Proxy übernimmt das Refreshen.
        }
      },
    },
  });
}

/** Admin-Client mit Service-Role-Key. Umgeht RLS – nur in Server-Routen nutzen. */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY fehlt");
  return createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
