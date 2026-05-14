const lessonFiles = import.meta.glob("../../../docs/lessons/**/*.md", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

const lessonLoadersByPath = Object.fromEntries(
  Object.entries(lessonFiles).map(([path, loader]) => {
    const normalizedPath = path.replace("../../../", "");
    return [normalizedPath, loader];
  }),
) as Record<string, () => Promise<string>>;

export async function loadLessonContent(path: string) {
  const loader = lessonLoadersByPath[path];
  return loader ? loader() : "";
}
