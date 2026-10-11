import { describe, expect, it } from "vitest";
import { mapGitHub } from "@/integrations/github";

describe("mapGitHub", () => {
  it("bildet Beiträge, Repos und PRs ab", () => {
    const days = Array.from({ length: 200 }, (_, i) => ({ date: `d${i}`, contributionCount: i % 3 }));
    const data = mapGitHub({
      data: {
        viewer: {
          login: "me",
          contributionsCollection: { contributionCalendar: { totalContributions: 42, weeks: [{ contributionDays: days }] } },
          repositories: {
            nodes: [
              {
                name: "repo",
                url: "https://github.com/me/repo",
                isPrivate: false,
                primaryLanguage: { name: "TypeScript", color: "#3178c6" },
                defaultBranchRef: {
                  target: { messageHeadline: "fix", committedDate: "2026-10-11T10:00:00Z", url: "u", statusCheckRollup: { state: "FAILURE" } },
                },
              },
              { name: "empty", url: "u", isPrivate: true, primaryLanguage: null, defaultBranchRef: null },
            ],
          },
          pullRequests: {
            nodes: [
              { title: "PR", url: "p", createdAt: "2026-10-10", repository: { nameWithOwner: "me/repo" }, commits: { nodes: [] } },
            ],
          },
        },
      },
    });
    expect(data.days).toHaveLength(105);
    expect(data.totalContributions).toBe(42);
    expect(data.repos[0].lastCommit?.ci).toBe("FAILURE");
    expect(data.repos[1].lastCommit).toBeNull();
    expect(data.pullRequests[0]).toMatchObject({ repo: "me/repo", ci: null });
  });

  it("meldet GraphQL-Fehler verständlich", () => {
    expect(() => mapGitHub({ errors: [{ message: "Bad credentials" }] })).toThrow("Bad credentials");
  });
});
