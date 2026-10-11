import { beforeEach, describe, expect, it, vi } from "vitest";

describe("env", () => {
  beforeEach(() => vi.resetModules());

  it("behandelt leere Werte wie nicht gesetzt", async () => {
    vi.stubEnv("NEWS_FEEDS", "");
    vi.stubEnv("DEFAULT_LAT", "");
    vi.stubEnv("APP_URL", "");
    const { env, newsFeeds } = await import("@/lib/env");
    expect(newsFeeds().length).toBeGreaterThan(3);
    expect(env().DEFAULT_LAT).toBe(52.52);
    expect(env().APP_URL).toBe("http://localhost:3000");
  });

  it("liest Feeds mit und ohne Kategorie", async () => {
    vi.stubEnv("NEWS_FEEDS", "A|https://a.example/rss, B|https://b.example/rss|Tech");
    const { newsFeeds } = await import("@/lib/env");
    expect(newsFeeds()).toEqual([
      { name: "A", url: "https://a.example/rss", category: "Allgemein" },
      { name: "B", url: "https://b.example/rss", category: "Tech" },
    ]);
  });
});
