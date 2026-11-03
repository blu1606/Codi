// Run: npx tsx --test src/lib/github-profile-guidance.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  githubGuidanceNote,
  matchCoursesToProfile,
  matchReason,
  type GuidanceCourse,
  type GuidanceProfile,
} from "./github-profile-guidance";

const profile: GuidanceProfile = {
  level: "new",
  levelConfidence: "low",
  technologies: [
    { name: "React", usage: "tried" },
    { name: "JavaScript", usage: "tried" },
    { name: "Java", usage: "deep" },
  ],
  areas: [{ label: "Phát triển giao diện web", confidence: "low" }],
};
const course = (id: string, title: string, level: string, skills: string[], description = ""): GuidanceCourse => ({
  id,
  title,
  slug: id,
  description,
  level,
  skills,
});
const catalog = [
  course("react", "React từ cơ bản đến dự án thực tế", "Intermediate", ["JSX", "Component", "useEffect"]),
  course("js", "JavaScript nền tảng", "Beginner", ["Hàm", "Closure", "Bất đồng bộ"]),
  course("python", "Python cơ bản", "Beginner", ["Cú pháp", "Vòng lặp"]),
  course("css", "CSS layout", "Advanced", []),
  course("owned", "React nâng cao", "Advanced", ["Hooks"]),
];

test("ranks courses that deepen tried technologies at a fitting level first, excluding owned ones", () => {
  const matches = matchCoursesToProfile(profile, catalog, { owned: new Set(["owned"]), masteredSkills: [] });
  assert.deepEqual(matches.map((m) => m.courseId), ["js", "react", "python"]);
  assert.deepEqual(matches[0]!.builds, ["JavaScript"]);
  assert.equal(matches[0]!.levelFit, 2);
  // A course unrelated to the profile and without skills is not a recommendation.
  assert.ok(!matches.some((m) => m.courseId === "css"));
});

test("whole-term matching: Java never matches JavaScript", () => {
  const [js] = matchCoursesToProfile(profile, [catalog[1]!], { owned: new Set(), masteredSkills: [] });
  assert.deepEqual(js!.builds, ["JavaScript"]);
});

test("skills already mastered on Codi are not counted as gaps (accent and case insensitive)", () => {
  const [js] = matchCoursesToProfile(profile, [catalog[1]!], { owned: new Set(), masteredSkills: ["closure", "HAM"] });
  assert.deepEqual(js!.fills, ["Bất đồng bộ"]);
});

test("a goal term lifts matching courses", () => {
  const matches = matchCoursesToProfile(profile, catalog, { owned: new Set(), masteredSkills: [], query: "python" });
  assert.equal(matches[0]!.courseId, "python");
});

test("reason and note are built from the data only", () => {
  const [js] = matchCoursesToProfile(profile, [catalog[1]!], { owned: new Set(), masteredSkills: [] });
  assert.equal(matchReason(js!, profile), "Xây tiếp trên JavaScript bạn đã dùng · Bổ sung Hàm, Closure, Bất đồng bộ · Hợp mức mới bắt đầu");
  const note = githubGuidanceNote(profile);
  assert.match(note, /React \(đã thử\)/);
  assert.match(note, /recommend_courses_for_profile/);
  assert.equal(githubGuidanceNote({ level: null, levelConfidence: null, technologies: [], areas: [] }), "");
});
