/**
 * Browser half of dsh-external-link.
 *
 * The Electron shell treats http://localhost and http://127.0.0.1 as its own
 * surface, so those links land in an in-app window and the markup's own
 * window.open never reaches the OS browser. This module captures anchor clicks
 * before the application sees them and routes every off-origin link through the
 * host's platform opener instead, which always ends in the default browser.
 */
window.__ModuleLoader__.load({
  id: "dsh-external-link",
  factory() {
    const OPEN_ROUTE = "/external-link/open";
    const OPENABLE = new Set(["http:", "https:", "mailto:", "tel:"]);

    /** Ask the host to hand one URL to the platform opener. */
    function openExternal(url) {
      return fetch(OPEN_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
    }

    /** The off-origin, openable URL behind a click, or null. */
    function linkOf(event) {
      const target = event.target;
      const anchor = target && typeof target.closest === "function" ? target.closest("a[href]") : null;
      if (anchor === null) return null;
      let url;
      try {
        url = new URL(anchor.href, location.href);
      } catch {
        return null;
      }
      if (!OPENABLE.has(url.protocol)) return null;
      if (url.origin === location.origin) return null;
      return url.href;
    }

    /**
     * Capture-phase anchor handler: off-origin links leave through the host,
     * everything else keeps the application's own behaviour.
     * @param event - the document click event.
     */
    function onClick(event) {
      const url = linkOf(event);
      if (url === null) return;
      event.preventDefault();
      event.stopPropagation();
      void openExternal(url).catch(() => {
        window.open(url, "_blank", "noopener,noreferrer");
      });
    }

    return {
      apply(ctx) {
        ctx.effect(() => {
          document.addEventListener("click", onClick, true);
          return () => {
            document.removeEventListener("click", onClick, true);
          };
        });
      },
    };
  },
});
