import { useEffect, useState } from "react";
import { ArrowLeft, Route as RouteIcon } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LessonContent } from "./lesson-content";
import { ReaderTopBar } from "./reader-top-bar";
import { loadLessonContent } from "../data/lesson-content";

// Keep the track reader in sync with the saved theme even on a cold/direct load.
function applyStoredTheme() {
  const saved = window.localStorage.getItem("cloud-katas-theme");
  const theme = saved === "light" || saved === "dark" ? saved : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
}

export function TrackPage() {
  const navigate = useNavigate();
  const { name } = useParams();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  // Track docs live directly under docs/lessons/ and follow the `<name>-track.md` convention.
  const trackPath = `docs/lessons/${name}-track.md`;

  useEffect(() => {
    applyStoredTheme();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setContent("");

    loadLessonContent(trackPath)
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [trackPath]);

  return (
    <main className="app-shell primer-shell">
      <section className="content">
        <ReaderTopBar>
          <button className="theme-toggle" type="button" onClick={() => navigate(-1)} aria-label="Go back" title="Go back">
            <ArrowLeft size={20} />
          </button>
          <Link className="github-link" to="/" aria-label="All modules" title="All modules">
            <RouteIcon size={18} />
            <span>All modules</span>
          </Link>
        </ReaderTopBar>

        <header className="hero">
          <div>
            <div className="hero-tags">
              <span className="provider-pill shared">track</span>
            </div>
            <h1>Learning Track</h1>
            <p className="lesson-path">File: {trackPath}</p>
          </div>
        </header>

        <section className="lesson-reader-panel">
          {loading ? <p className="muted">Loading track...</p> : null}
          {!loading && content ? <LessonContent content={content} basePath={trackPath} /> : null}
          {!loading && !content ? <p className="muted">Track not found. <Link to="/">Back to the lessons</Link>.</p> : null}
        </section>
      </section>
    </main>
  );
}
