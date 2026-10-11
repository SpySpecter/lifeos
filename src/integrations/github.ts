import "server-only";
import { env } from "@/lib/env";
import { addDays, lastDays, today } from "@/lib/time";
import { IntegrationError, fetchJson, type Integration } from "./core";

export type CiState = "SUCCESS" | "FAILURE" | "PENDING" | "ERROR" | "EXPECTED" | null;

export type GitHubData = {
  login: string;
  totalContributions: number;
  /** Letzte 15 Wochen, älteste zuerst. */
  days: { date: string; count: number }[];
  repos: {
    name: string;
    url: string;
    isPrivate: boolean;
    language: { name: string; color: string | null } | null;
    lastCommit: { message: string; date: string; url: string; ci: CiState } | null;
  }[];
  pullRequests: { title: string; url: string; repo: string; createdAt: string; ci: CiState }[];
};

const QUERY = /* GraphQL */ `
  query Dashboard {
    viewer {
      login
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount } }
        }
      }
      repositories(first: 6, orderBy: { field: PUSHED_AT, direction: DESC }, ownerAffiliations: OWNER) {
        nodes {
          name
          url
          isPrivate
          primaryLanguage { name color }
          defaultBranchRef {
            target {
              ... on Commit { messageHeadline committedDate url statusCheckRollup { state } }
            }
          }
        }
      }
      pullRequests(first: 5, states: OPEN, orderBy: { field: CREATED_AT, direction: DESC }) {
        nodes {
          title
          url
          createdAt
          repository { nameWithOwner }
          commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
        }
      }
    }
  }
`;

type Raw = {
  data?: {
    viewer: {
      login: string;
      contributionsCollection: {
        contributionCalendar: {
          totalContributions: number;
          weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
        };
      };
      repositories: {
        nodes: {
          name: string;
          url: string;
          isPrivate: boolean;
          primaryLanguage: { name: string; color: string | null } | null;
          defaultBranchRef: {
            target: { messageHeadline?: string; committedDate?: string; url?: string; statusCheckRollup?: { state: CiState } | null };
          } | null;
        }[];
      };
      pullRequests: {
        nodes: {
          title: string;
          url: string;
          createdAt: string;
          repository: { nameWithOwner: string };
          commits: { nodes: { commit: { statusCheckRollup: { state: CiState } | null } }[] };
        }[];
      };
    };
  };
  errors?: { message: string }[];
};

export function mapGitHub(raw: Raw): GitHubData {
  if (!raw.data) throw new IntegrationError(raw.errors?.[0]?.message ?? "GitHub: keine Daten");
  const v = raw.data.viewer;
  const cal = v.contributionsCollection.contributionCalendar;
  const days = cal.weeks.flatMap((w) => w.contributionDays).map((d) => ({ date: d.date, count: d.contributionCount }));
  return {
    login: v.login,
    totalContributions: cal.totalContributions,
    days: days.slice(-15 * 7),
    repos: v.repositories.nodes.map((r) => {
      const t = r.defaultBranchRef?.target;
      return {
        name: r.name,
        url: r.url,
        isPrivate: r.isPrivate,
        language: r.primaryLanguage,
        lastCommit:
          t?.messageHeadline && t.committedDate && t.url
            ? { message: t.messageHeadline, date: t.committedDate, url: t.url, ci: t.statusCheckRollup?.state ?? null }
            : null,
      };
    }),
    pullRequests: v.pullRequests.nodes.map((p) => ({
      title: p.title,
      url: p.url,
      repo: p.repository.nameWithOwner,
      createdAt: p.createdAt,
      ci: p.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null,
    })),
  };
}

export const github: Integration<GitHubData> = {
  id: "github",
  ttlSeconds: 10 * 60,
  missingConfig: () =>
    env().GITHUB_TOKEN ? null : { hint: "GITHUB_TOKEN (Fine-grained, nur lesend) in .env eintragen", connectHref: "/settings#github" },
  async fetch() {
    const raw = await fetchJson<Raw>("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env().GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "lifeos-dashboard",
      },
      body: JSON.stringify({ query: QUERY }),
    });
    return mapGitHub(raw);
  },
  mock() {
    const end = today();
    let seed = 7;
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const days = lastDays(end, 105).map((date) => {
      const r = rand();
      return { date, count: r < 0.3 ? 0 : Math.round(r * r * 14) };
    });
    const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    return {
      login: "SpySpecter",
      totalContributions: 1284,
      days,
      repos: [
        { name: "lifeos", url: "#", isPrivate: false, language: { name: "TypeScript", color: "#3178c6" }, lastCommit: { message: "feat: Spotify-Widget mit Top-Artists", date: ago(2), url: "#", ci: "SUCCESS" } },
        { name: "my-assistant", url: "#", isPrivate: true, language: { name: "Python", color: "#3572A5" }, lastCommit: { message: "vault: nightly backup", date: ago(9), url: "#", ci: "SUCCESS" } },
        { name: "InformatikLK", url: "#", isPrivate: false, language: { name: "Java", color: "#b07219" }, lastCommit: { message: "Sortieralgorithmen: Quicksort + Tests", date: ago(30), url: "#", ci: "FAILURE" } },
        { name: "dotfiles", url: "#", isPrivate: false, language: { name: "Shell", color: "#89e051" }, lastCommit: { message: "ghostty: neues Theme", date: ago(80), url: "#", ci: null } },
      ],
      pullRequests: [
        { title: "Habit-Heatmap auf 12 Wochen erweitern", url: "#", repo: "SpySpecter/lifeos", createdAt: addDays(end, -1), ci: "PENDING" },
      ],
    };
  },
};
