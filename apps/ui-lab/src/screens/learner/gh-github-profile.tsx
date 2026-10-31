import { useEffect, type ReactNode } from "react";
import { http, HttpResponse } from "msw";
import { ProfileView } from "@/app/profile/profile-view";
import type { GithubProfilePageState } from "@/components/profile/github-profile-page-state";
import { accountRoles, accountUser } from "@/demo-fixtures/commerce/s04b-account";
import {
  githubProfileInsufficient,
  githubProfileReady,
  githubProfileStale,
} from "@/demo-fixtures/learner/github-profile";
import type { GithubProfileProjection } from "@/lib/github-profile-analysis-contract";
import { fixtureHandlers } from "../commerce/lab-support";
import type { Screen, ScreenState } from "../screen-types";

type LinkError = GithubProfilePageState["initialLinkError"];

/** Lab-only: presses the named buttons in order, so a dialog or in-progress step shows without a manual click. */
function PressInOrder({ labels }: { labels: readonly string[] }) {
  useEffect(() => {
    let step = 0;
    let attempts = 0;
    let timer = 0;
    const tick = () => {
      if (step >= labels.length || attempts > 40) return;
      attempts += 1;
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === labels[step]);
      if (button) {
        step += 1;
        attempts = 0;
        button.click();
      }
      timer = window.setTimeout(tick, 150);
    };
    timer = window.setTimeout(tick, 300);
    return () => window.clearTimeout(timer);
  }, [labels]);
  return null;
}

const page = (
  profile: GithubProfileProjection | null,
  linked: boolean | null,
  linkError: LinkError,
  press: readonly string[],
): ReactNode => (
  <>
    {press.length > 0 && <PressInOrder labels={press} />}
    <ProfileView
      user={accountUser}
      roles={accountRoles}
      activeTab="nang-luc"
      github={{ initialProfile: profile, initialLinked: linked, initialLinkError: linkError, readFailed: false }}
    />
  </>
);

const CONSENT_AND_ANALYSE = ["Phân tích GitHub", "Tôi đồng ý · Phân tích"];

// Simulate the 202 + polling protocol entirely in the browser.
function backgroundAnalysis(outcome: "running" | "failed" | "completed"): ScreenState["handlers"] {
  let submitted = false;
  return [
    http.post("/api/github-profile", () => {
      submitted = true;
      return HttpResponse.json({ job: { id: "lab-github-job", status: "queued" } }, { status: 202 });
    }),
    http.get("/api/github-profile", () => HttpResponse.json({
      profile: submitted && outcome === "completed" ? githubProfileReady : null,
      job: submitted ? { id: "lab-github-job", status: outcome, errorCode: outcome === "failed" ? "request_failed" : null } : null,
    })),
  ];
}

const state = (
  label: string,
  profile: GithubProfileProjection | null,
  linked: boolean | null,
  options: { linkError?: LinkError; press?: string[]; handlers?: ScreenState["handlers"] } = {},
): ScreenState => ({
  label,
  route: { pathname: "/profile", search: { tab: "nang-luc" } },
  handlers: [...fixtureHandlers, ...(options.handlers ?? [])],
  render: () => page(profile, linked, options.linkError ?? null, options.press ?? []),
});

export const ghGithubProfileScreen: Screen = {
  id: "GH",
  title: "Hồ sơ năng lực GitHub",
  group: "Học tập",
  role: "learner",
  mockupHash: "#/github/analysis",
  states: {
    "not-connected": state("Chưa kết nối", null, false),
    "link-denied": state("Đã huỷ trên GitHub", null, false, { linkError: "denied" }),
    "link-already-linked": state("Tài khoản đã liên kết với Codi khác", null, false, { linkError: "already_linked" }),
    "link-failed": state("Kết nối thất bại", null, false, { linkError: "failed" }),
    "linked-no-analysis": state("Đã kết nối, chưa phân tích", null, true),
    analysing: state("Đang phân tích nền", null, true, { press: CONSENT_AND_ANALYSE, handlers: backgroundAnalysis("running") }),
    failed: state("Phân tích nền lỗi", null, true, { press: CONSENT_AND_ANALYSE, handlers: backgroundAnalysis("failed") }),
    "background-ready": state("Phân tích nền hoàn thành", null, true, { press: CONSENT_AND_ANALYSE, handlers: backgroundAnalysis("completed") }),
    insufficient: state("Chưa đủ dữ liệu", githubProfileInsufficient, true),
    ready: state("Hồ sơ đã phân tích", githubProfileReady, true),
    stale: state("Hồ sơ quá 90 ngày", githubProfileStale, true),
    "delete-confirm": state("Xác nhận ngắt kết nối", githubProfileReady, true, { press: ["Ngắt kết nối"] }),
  },
};
