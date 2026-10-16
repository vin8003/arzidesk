import { Link, createRouter } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
      <div className="max-w-sm text-center">
        <p className="text-lg font-semibold">Page not found</p>
        <p className="mt-2 text-sm text-muted">यह पेज नहीं मिला। The link may be old or the case was deleted.</p>
        <Link to="/" className="link-accent mt-5 inline-block text-sm">
          ArziDesk
        </Link>
      </div>
    </main>
  );
}

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    defaultNotFoundComponent: NotFound,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
  });
}
