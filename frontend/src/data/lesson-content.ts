const lessonFiles = import.meta.glob("../../../docs/lessons/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const lessonContentByPath = Object.fromEntries(
  Object.entries(lessonFiles).map(([path, content]) => {
    const normalizedPath = path.replace("../../../", "");
    return [normalizedPath, content];
  }),
) as Record<string, string>;
