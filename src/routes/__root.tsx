import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { ScrollMemory } from "@/components/scroll-memory";
import { ClientToaster } from "@/components/client-toaster";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import appCss from "../styles.css?url";

const APP_NAME = "ArziDesk";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "ArziDesk — assisted filing desk for advocates and e-Mitra operators: RTI, stuck PM-Kisan / MGNREGA / pension payments and consumer complaints in UP, Rajasthan, MP and Delhi.",
      },
      { name: "theme-color", content: "#f8f7f3", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#1a1917", media: "(prefers-color-scheme: dark)" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        // Plex Sans and its Devanagari companion carry the UI in both languages;
        // Source Serif sets legal documents. Unicode-range subsets mean Hindi
        // glyphs only download when Hindi is on screen.
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Devanagari:wght@400;500;600&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Noto+Serif+Devanagari:wght@400;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap",
      },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: () => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="antialiased">
        <PreviewHostBridge />
        <ScrollMemory />
        <AuthProvider>
          <Outlet />
          <ClientToaster />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
