import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import { users } from "../drizzle/schema";

describe("MySQL Drizzle dialect", () => {
  it("quotes tables and columns with MySQL backticks", () => {
    const db = drizzle(process.env.DATABASE_URL ?? "mysql://user:pass@localhost:3306/test");
    const query = db
      .insert(users)
      .values({ openId: "google:dialect-test", loginMethod: "google" })
      .onDuplicateKeyUpdate({ set: { lastSignedIn: new Date() } })
      .toSQL();

    expect(query.sql).toContain("insert into `users`");
    expect(query.sql).not.toContain("insert into 'users'");
    expect(query.sql).toContain("on duplicate key update");
  });
});
