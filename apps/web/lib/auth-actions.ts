"use server";

import { signOut } from "@/lib/auth";

export async function signOutAction(redirectTo: string = "/login") {
  await signOut({ redirectTo });
}
