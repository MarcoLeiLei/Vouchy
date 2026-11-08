import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { pushToUser } from "@/lib/notify";

export async function POST() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const sent = await pushToUser(supabaseAdmin(), user.id, {
    title: "Hallo von Vouchy 👋",
    body: "So sieht eine Erinnerung aus. Ab jetzt verfällt nichts mehr.",
    url: "/",
  });
  return NextResponse.json({ sent });
}
