import { useEffect, useId, useState } from "react";

type MermaidDiagramProps = {
  title: string;
  source: string;
};

export function MermaidDiagram({ title, source }: MermaidDiagramProps) {
  const id = useId().replaceAll(":", "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setSvg("");

    import("mermaid")
      .then((result) => {
        const mermaid = result.default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            primaryColor: "#e7f0ff",
            primaryBorderColor: "#3178c6",
            primaryTextColor: "#102033",
            lineColor: "#65758b",
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          },
        });
        return mermaid.render(`diagram-${id}`, source);
      })
      .then((result) => {
        if (cancelled) {
          return;
        }

        setSvg(result.svg);
        setError("");
      })
      .catch(() => {
        if (!cancelled) {
          setError("Diagram could not be rendered.");
          setSvg("");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id, source]);

  return (
    <section className="diagram-panel" aria-label={title}>
      <div className="section-heading">
        <span>Visual</span>
        <h3>{title}</h3>
      </div>
      {loading ? <p className="muted">Loading diagram...</p> : null}
      {error ? <p className="diagram-error">{error}</p> : <div className="diagram-canvas" dangerouslySetInnerHTML={{ __html: svg }} />}
    </section>
  );
}
