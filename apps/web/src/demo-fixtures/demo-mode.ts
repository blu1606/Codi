/** Demo fallback is opt-in and off by default, so production keeps its real error states. */
export const DEMO_FALLBACK = ["true", "1"].includes(process.env.NEXT_PUBLIC_DEMO_FALLBACK ?? "");

/**
 * Page loaders: return demo data when the real read throws and demo fallback is on.
 * `demo` lets the page show the "Dữ liệu mẫu" notice.
 */
export async function withDemoFallback<T>(load: () => Promise<T>, fixture: () => T): Promise<{ data: T; demo: boolean }> {
  try {
    return { data: await load(), demo: false };
  } catch (error) {
    if (!DEMO_FALLBACK) throw error;
    console.warn("[demo-fallback] page loader failed, using demo data", error);
    return { data: fixture(), demo: true };
  }
}
