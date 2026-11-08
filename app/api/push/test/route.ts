import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { pushToUser } from "@/lib/notify";

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const sent = await pushToUser(user.id, { title: "Hallo von Vouchy 👋", body: "So sieht eine Erinnerung aus. Ab jetzt verfällt nichts mehr.", url: "/" });
  return NextResponse.json({ sent });
}
