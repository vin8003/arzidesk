import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isCustomAuthHost,
  pinAuthVisitorHost,
  visitorAuthHost,
} from "./visitor-host.ts";

describe("visitorAuthHost", () => {
  it("accepts arzidesk and ordereasy subdomains, rejects grok.me", () => {
    assert.equal(isCustomAuthHost("arzidesk.ordereasy.win"), true);
    assert.equal(isCustomAuthHost("citebench.ordereasy.win"), true);
    assert.equal(isCustomAuthHost("later.ordereasy.win"), true);
    assert.equal(isCustomAuthHost("finch-apple-spring-tiger.grok.me"), false);
  });

  it("prefers Origin over a grok.me Host", () => {
    const req = new Request("https://finch-apple-spring-tiger.grok.me/api/auth/sign-in/oauth2", {
      method: "POST",
      headers: {
        host: "finch-apple-spring-tiger.grok.me",
        origin: "https://arzidesk.ordereasy.win",
      },
    });
    assert.equal(visitorAuthHost(req), "arzidesk.ordereasy.win");
    const pinned = pinAuthVisitorHost(req);
    assert.equal(pinned.headers.get("x-forwarded-host"), "arzidesk.ordereasy.win");
  });

  it("reads the public-host cookie on the OAuth callback (no Origin)", () => {
    const req = new Request(
      "https://finch-apple-spring-tiger.grok.me/api/auth/oauth2/callback/grok-google",
      {
        headers: {
          host: "finch-apple-spring-tiger.grok.me",
          cookie: "__Host-grok-auth.public_host=arzidesk.ordereasy.win",
        },
      },
    );
    assert.equal(visitorAuthHost(req), "arzidesk.ordereasy.win");
  });
});
