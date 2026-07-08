import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Github, Moon, PanelLeftClose, PanelLeftOpen, RotateCcw, Route as RouteIcon, Search, ShieldCheck, Star, Sun } from "lucide-react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { MermaidDiagram } from "./components/mermaid-diagram";
import { LessonContent } from "./components/lesson-content";
import { PrimerPage } from "./components/primer-page";
import { TrackPage } from "./components/track-page";
import { StatusBar } from "./components/status-bar";
import { ModuleNav } from "./components/module-nav";
import { ProgressMeter } from "./components/progress-meter";
import { LocalLabBadge, LocalLabPanel } from "./components/local-lab-panel";
import { loadLessonContent } from "./data/lesson-content";
import { modules, moduleBySlug, type Module, type Provider } from "./data/modules";
import { bestPractices, certifications, resources } from "./data/resources";
import { loadProgress, resetProgress, saveProgress, type Progress } from "./state/progress";

type Filter = Provider | "all";
type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  const savedTheme = window.localStorage.getItem("cloud-katas-theme");
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function App() {
  return (
    <div className="app-root">
      <Routes>
        <Route path="/" element={<Navigate to={`/modules/${modules[0].slug}`} replace />} />
        <Route path="/modules/:slug" element={<LearningPortal />} />
        <Route path="/primers/:name" element={<PrimerPage />} />
        <Route path="/tracks/:name" element={<TrackPage />} />
        <Route path="*" element={<Navigate to={`/modules/${modules[0].slug}`} replace />} />
      </Routes>
      <StatusBar />
    </div>
  );
}

function LearningPortal() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const activeSlug = moduleBySlug.has(slug ?? "") ? slug ?? modules[0].slug : modules[0].slug;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [lessonContent, setLessonContent] = useState("");
  const [lessonLoading, setLessonLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem("cloud-katas-sidebar") === "collapsed");
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  useEffect(() => {
    window.localStorage.setItem("cloud-katas-sidebar", sidebarCollapsed ? "collapsed" : "expanded");
  }, [sidebarCollapsed]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("cloud-katas-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (slug && !moduleBySlug.has(slug)) {
      navigate(`/modules/${modules[0].slug}`, { replace: true });
    }
  }, [navigate, slug]);

  const activeModule = moduleBySlug.get(activeSlug) ?? modules[0];
  const completedSet = new Set(progress.completedModules);

  const isLocked = (module: Module) => module.prerequisites.some((slug) => !completedSet.has(slug));

  const filteredModules = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return modules.filter((module) => {
      const providerMatch = filter === "all" || module.provider === filter;
      const content = [module.title, module.provider, ...module.objectives, ...module.concepts, ...module.exercises].join(" ").toLowerCase();
      return providerMatch && (!normalizedQuery || content.includes(normalizedQuery));
    });
  }, [filter, query]);

  const nextModule = modules.find((module) => !completedSet.has(module.slug) && !isLocked(module));
  const completedExercises = progress.completedExercises[activeModule.slug] ?? [];

  useEffect(() => {
    let cancelled = false;
    setLessonLoading(true);
    setLessonContent("");

    loadLessonContent(activeModule.lessonPath)
      .then((content) => {
        if (!cancelled) {
          setLessonContent(content);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLessonLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeModule.lessonPath]);

  function toggleModule(slug: string) {
    setProgress((current) => {
      const complete = current.completedModules.includes(slug);
      return {
        ...current,
        completedModules: complete ? current.completedModules.filter((item) => item !== slug) : [...current.completedModules, slug],
      };
    });
  }

  function toggleExercise(moduleSlug: string, index: number) {
    setProgress((current) => {
      const currentExercises = current.completedExercises[moduleSlug] ?? [];
      const complete = currentExercises.includes(index);
      const nextExercises = complete ? currentExercises.filter((item) => item !== index) : [...currentExercises, index];
      return {
        ...current,
        completedExercises: {
          ...current.completedExercises,
          [moduleSlug]: nextExercises,
        },
      };
    });
  }

  function clearProgress() {
    resetProgress();
    setProgress({ completedModules: [], completedExercises: {} });
  }

  function selectModule(moduleSlug: string) {
    navigate(`/modules/${moduleSlug}`);
  }

  return (
    <main className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <Link className="brand" to="/" aria-label="Cloud Katas home">
            <div className="brand-mark">
              <BookOpen size={22} />
            </div>
            <div className="sidebar-label">
              <span>Cloud Katas</span>
              <strong>GCP to AWS</strong>
            </div>
          </Link>
          <button
            className="sidebar-toggle"
            type="button"
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
        </div>

        <div className="sidebar-panel">
          <ProgressMeter completed={progress.completedModules.length} total={modules.length} label="Learning path" />

          <div className="search-box">
            <Search size={18} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search modules" aria-label="Search modules" />
          </div>

          <div className="filter-row" aria-label="Filter modules">
            {(["all", "gcp", "shared", "aws"] as Filter[]).map((item) => (
              <button key={item} className={filter === item ? "selected" : ""} type="button" onClick={() => setFilter(item)}>
                {item}
              </button>
            ))}
          </div>

          <div className="sidebar-tracks">
            <span className="sidebar-section-label">Tracks</span>
            <Link className="track-link" to="/tracks/devops">
              <RouteIcon size={17} aria-hidden="true" />
              <span>DevOps Track</span>
            </Link>
          </div>

          <ModuleNav modules={filteredModules} activeSlug={activeSlug} completed={progress.completedModules} isLocked={isLocked} onSelect={selectModule} />
        </div>
      </aside>

      <section className="content">
        <div className="top-actions">
          <a
            className="github-link"
            href="https://github.com/rajeshpillai/cloud-katas"
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Star Cloud Katas on GitHub"
            title="Star on GitHub"
          >
            <Github size={18} />
            <Star size={14} />
            <span>Star on GitHub</span>
          </a>
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
            aria-label={theme === "light" ? "Use dark mode" : "Use light mode"}
            title={theme === "light" ? "Use dark mode" : "Use light mode"}
          >
            {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
          </button>
        </div>

        <header className="hero">
          <div>
            <div className="hero-tags">
              <span className={`provider-pill ${activeModule.provider}`}>{activeModule.provider}</span>
              <LocalLabBadge localLab={activeModule.localLab} />
            </div>
            <h1>{activeModule.title}</h1>
            <p>{activeModule.objectives.join(" • ")}</p>
            <p className="lesson-path">Lesson file: {activeModule.lessonPath}</p>
          </div>
          <button className="primary-action" type="button" onClick={() => toggleModule(activeModule.slug)}>
            <CheckCircle2 size={20} />
            {completedSet.has(activeModule.slug) ? "Mark incomplete" : "Mark complete"}
          </button>
        </header>

        <section className="summary-grid">
          <div>
            <span className="metric">{modules.length}</span>
            <span>Modules</span>
          </div>
          <div>
            <span className="metric">{progress.completedModules.length}</span>
            <span>Completed</span>
          </div>
          <div>
            <span className="metric">{nextModule ? nextModule.id : "Done"}</span>
            <span>Next module</span>
          </div>
        </section>

        <LocalLabPanel localLab={activeModule.localLab} />

        <section className="lesson-layout">
          <article className="lesson-card">
            <div className="section-heading">
              <span>Prerequisites</span>
              <h2>Before You Start</h2>
            </div>
            {activeModule.prerequisites.length === 0 ? (
              <p className="muted">No prerequisites. This is an entry point for the path.</p>
            ) : (
              <div className="link-list">
                {activeModule.prerequisites.map((slug) => {
                  const prerequisite = moduleBySlug.get(slug);
                  return (
                    <button key={slug} type="button" onClick={() => selectModule(slug)}>
                      {completedSet.has(slug) ? <CheckCircle2 size={17} /> : <ShieldCheck size={17} />}
                      {prerequisite?.title ?? slug}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="section-heading">
              <span>Objectives</span>
              <h2>What You Will Learn</h2>
            </div>
            <ul className="clean-list">
              {activeModule.objectives.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <div className="section-heading">
              <span>Concepts</span>
              <h2>Key Concepts</h2>
            </div>
            <div className="chip-cloud">
              {activeModule.concepts.map((concept) => (
                <span key={concept}>{concept}</span>
              ))}
            </div>
          </article>

          <article className="lesson-card">
            <div className="section-heading">
              <span>Hands On</span>
              <h2>Exercises</h2>
            </div>
            <div className="exercise-list">
              {activeModule.exercises.map((exercise, index) => (
                <label key={exercise}>
                  <input type="checkbox" checked={completedExercises.includes(index)} onChange={() => toggleExercise(activeModule.slug, index)} />
                  <span>{exercise}</span>
                </label>
              ))}
            </div>
          </article>
        </section>

        <MermaidDiagram title={activeModule.diagramTitle} source={activeModule.mermaid} />

        <section className="lesson-reader-panel">
          <div className="section-heading">
            <span>Lesson</span>
            <h2>Full Lesson Content</h2>
          </div>
          {lessonLoading ? <p className="muted">Loading lesson...</p> : null}
          {!lessonLoading && lessonContent ? <LessonContent content={lessonContent} basePath={activeModule.lessonPath} /> : null}
          {!lessonLoading && !lessonContent ? <p className="muted">Lesson content is not available yet.</p> : null}
        </section>

        <section className="resource-grid">
          <article className="lesson-card">
            <div className="section-heading">
              <span>References</span>
              <h2>Resources</h2>
            </div>
            <div className="external-links">
              {resources.map((resource) => (
                <a key={resource.url} href={resource.url} target="_blank" rel="noreferrer">
                  {resource.label}
                </a>
              ))}
            </div>
          </article>

          <article className="lesson-card">
            <div className="section-heading">
              <span>Operating Model</span>
              <h2>Best Practices</h2>
            </div>
            <ul className="compact-list">
              {bestPractices.slice(0, 6).map((practice) => (
                <li key={practice}>{practice}</li>
              ))}
            </ul>
          </article>

          <article className="lesson-card">
            <div className="section-heading">
              <span>Credentials</span>
              <h2>Certifications</h2>
            </div>
            <ul className="compact-list">
              {certifications.map((certification) => (
                <li key={certification}>{certification}</li>
              ))}
            </ul>
          </article>
        </section>

        <footer className="footer-actions">
          <button type="button" onClick={clearProgress}>
            <RotateCcw size={18} />
            Reset progress
          </button>
        </footer>
      </section>
    </main>
  );
}
