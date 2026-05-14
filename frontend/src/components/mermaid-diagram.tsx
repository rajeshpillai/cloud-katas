import { useEffect, useId, useState } from "react";
import mermaid from "mermaid";

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

type MermaidDiagramProps = {
  title: string;
  source: string;
};

export function MermaidDiagram({ title, source }: MermaidDiagramProps) {
  const id = useId().replaceAll(":", "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    mermaid
      .render(`diagram-${id}`, source)
      .then((result) => {
        if (!cancelled) {
          setSvg(result.svg);
          setError("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Diagram could not be rendered.");
          setSvg("");
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
      {error ? <p className="diagram-error">{error}</p> : <div className="diagram-canvas" dangerouslySetInnerHTML={{ __html: svg }} />}
    </section>
  );
}
