import { useEffect } from "react";
import { Github } from "lucide-react";

const REPO_URL = "https://github.com/rajeshpillai/cloud-katas";
const COMPANY = "Algorisys Technologies Pvt Ltd";
const RELOAD_PARAM = "hardreload";

// Reload the page while bypassing the HTTP cache. A plain location.reload() can
// serve a stale index.html within GitHub Pages' max-age window; a unique query
// param forces a fresh fetch, and the new content-hashed assets follow from it.
function hardReload() {
  const url = new URL(window.location.href);
  url.searchParams.set(RELOAD_PARAM, Date.now().toString());
  window.location.replace(url.toString());
}

export function StatusBar() {
  const year = new Date().getFullYear();

  // After a hard reload, strip the cache-busting param so the address bar stays clean.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has(RELOAD_PARAM)) {
      url.searchParams.delete(RELOAD_PARAM);
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  return (
    <footer className="status-bar" role="contentinfo">
      <div className="status-bar-left">
        <span className="status-copyright">
          © {year} {COMPANY}. All rights reserved.
        </span>
      </div>
      <div className="status-bar-right">
        <span className="status-meta" title={`Version ${__APP_VERSION__}, built ${__BUILD_DATE__}`}>
          <button
            type="button"
            className="status-version"
            onClick={hardReload}
            title="Hard reload — fetch the latest deployed build (bypass cache)"
          >
            v{__APP_VERSION__}
          </button>
          <span className="status-sep" aria-hidden="true">
            ·
          </span>
          <span className="status-date">{__BUILD_DATE__}</span>
        </span>
        <a className="status-bar-link" href={REPO_URL} target="_blank" rel="noreferrer noopener">
          <Github size={14} />
          <span>Source on GitHub</span>
        </a>
      </div>
    </footer>
  );
}
