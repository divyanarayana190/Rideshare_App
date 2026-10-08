// server/test-fetch.ts
import "dotenv/config";
import { eq } from "drizzle-orm";
import { userProfiles, users } from "../drizzle/schema";
import { getDb } from "./db";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // 1) list users
  const u = await db
    .select({
      id: users.id,
      openId: users.openId,
      name: users.name,
      email: users.email,
      role: users.role,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .orderBy(users.id);

  console.log("USERS:", u.slice(-10));

  // 2) fetch profile for last user
  const last = u[u.length - 1];
  if (!last) throw new Error("No users");

  const p = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, Number(last.id)))
    .limit(1);

  console.log("LAST USER:", last);
  console.log("LAST PROFILE:", p[0] ?? null);
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
