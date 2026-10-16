import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import {
  pinAuthVisitorHost,
  withPublicHostCookie,
} from "@/lib/auth/visitor-host";

async function handleAuth(request: Request): Promise<Response> {
  const pinned = pinAuthVisitorHost(request);
  const response = await auth.handler(pinned);
  return withPublicHostCookie(response, pinned);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuth(request),
      POST: ({ request }) => handleAuth(request),
    },
  },
});
