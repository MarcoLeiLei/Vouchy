"use client";
import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseBrowser() {
  if (!client) client = createBrowserClient(supabaseUrl, supabaseAnonKey);
  return client;
}
