import { useMemo, type ComponentPropsWithoutRef } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { modules } from "../data/modules";

type LessonContentProps = {
  content: string;
  // Docs-relative path of the file being rendered, e.g. "docs/lessons/aws/06-networking-in-aws.md".
  // Used to resolve relative links (other lessons, primers) into in-app routes.
  basePath?: string;
};

const slugByLessonPath = new Map(modules.map((module) => [module.lessonPath, module.slug]));

// Resolve a relative href against the directory of the current doc, collapsing "." and "..".
function resolveDocsPath(baseDir: string, href: string): string {
  const stack = baseDir.split("/").filter(Boolean);
  for (const part of href.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

// Given the current doc path and a relative markdown href, return the in-app route it maps to,
// or null if it isn't an internal docs link we can route.
function internalRouteFor(basePath: string | undefined, href: string): string | null {
  if (!basePath) return null;
  const [path, hash] = href.split("#");
  if (!path.endsWith(".md")) return null;
  const baseDir = basePath.split("/").slice(0, -1).join("/");
  const resolved = resolveDocsPath(baseDir, path);

  const slug = slugByLessonPath.get(resolved);
  if (slug) return `/modules/${slug}`;

  const primer = resolved.match(/^docs\/lessons\/primers\/(.+)\.md$/);
  if (primer) return `/primers/${primer[1]}${hash ? `#${hash}` : ""}`;

  // Track docs live directly under docs/lessons/ as `<name>-track.md` (e.g. devops-track.md → /tracks/devops).
  const track = resolved.match(/^docs\/lessons\/(.+)-track\.md$/);
  if (track) return `/tracks/${track[1]}${hash ? `#${hash}` : ""}`;

  return null;
}

function MarkdownAnchor({ href, children, basePath, ...rest }: ComponentPropsWithoutRef<"a"> & { basePath?: string }) {
  const navigate = useNavigate();

  if (!href) return <a {...rest}>{children}</a>;

  const isExternal = /^(https?:|mailto:|tel:)/i.test(href);
  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
        {children}
      </a>
    );
  }

  if (href.startsWith("#")) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  }

  const route = internalRouteFor(basePath, href);
  if (route) {
    return (
      <a
        href={route}
        onClick={(event) => {
          event.preventDefault();
          navigate(route);
        }}
        {...rest}
      >
        {children}
      </a>
    );
  }

  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}

export function LessonContent({ content, basePath }: LessonContentProps) {
  const components = useMemo<Components>(
    () => ({
      a: (props) => <MarkdownAnchor {...props} basePath={basePath} />,
    }),
    [basePath],
  );

  return (
    <article className="lesson-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </article>
  );
}
