import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LessonContent } from "./lesson-content";
import { loadLessonContent } from "../data/lesson-content";

// Keep the primer reader in sync with the saved theme even on a cold/direct load.
function applyStoredTheme() {
  const saved = window.localStorage.getItem("cloud-katas-theme");
  const theme = saved === "light" || saved === "dark" ? saved : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
}

export function PrimerPage() {
  const navigate = useNavigate();
  const { name } = useParams();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  const primerPath = `docs/lessons/primers/${name}.md`;

  useEffect(() => {
    applyStoredTheme();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setContent("");

    loadLessonContent(primerPath)
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [primerPath]);

  return (
    <main className="app-shell primer-shell">
      <section className="content">
        <div className="top-actions">
          <button className="theme-toggle" type="button" onClick={() => navigate(-1)} aria-label="Go back" title="Go back">
            <ArrowLeft size={20} />
          </button>
          <Link className="github-link" to="/primers/index" aria-label="All primers" title="All primers">
            <BookOpen size={18} />
            <span>All primers</span>
          </Link>
        </div>

        <header className="hero">
          <div>
            <div className="hero-tags">
              <span className="provider-pill shared">primer</span>
            </div>
            <h1>Fundamentals Primer</h1>
            <p className="lesson-path">File: {primerPath}</p>
          </div>
        </header>

        <section className="lesson-reader-panel">
          {loading ? <p className="muted">Loading primer...</p> : null}
          {!loading && content ? <LessonContent content={content} basePath={primerPath} /> : null}
          {!loading && !content ? <p className="muted">Primer not found. <Link to="/">Back to the lessons</Link>.</p> : null}
        </section>
      </section>
    </main>
  );
}
