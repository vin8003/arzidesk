import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { adminEmails, isAdminEmail } from "./allowlist.ts";

describe("admin allowlist", () => {
  it("fails closed when no admin emails are set", () => {
    const prevA = process.env.ADMIN_EMAILS;
    const prevB = process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_EMAILS;
    delete process.env.ADMIN_EMAIL;
    try {
      assert.deepEqual(adminEmails(), []);
      assert.equal(isAdminEmail("anyone@x.com"), false);
    } finally {
      if (prevA === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = prevA;
      if (prevB === undefined) delete process.env.ADMIN_EMAIL;
      else process.env.ADMIN_EMAIL = prevB;
    }
  });

  it("parses ADMIN_EMAILS and ADMIN_EMAIL together", () => {
    const prevA = process.env.ADMIN_EMAILS;
    const prevB = process.env.ADMIN_EMAIL;
    process.env.ADMIN_EMAILS = "one@x.com, Two@x.com";
    process.env.ADMIN_EMAIL = "three@x.com";
    try {
      assert.deepEqual(adminEmails(), ["one@x.com", "two@x.com", "three@x.com"]);
      assert.equal(isAdminEmail("TWO@x.com"), true);
      assert.equal(isAdminEmail("nope@x.com"), false);
      assert.equal(isAdminEmail(null), false);
    } finally {
      if (prevA === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = prevA;
      if (prevB === undefined) delete process.env.ADMIN_EMAIL;
      else process.env.ADMIN_EMAIL = prevB;
    }
  });
});
