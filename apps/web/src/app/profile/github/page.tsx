import { redirect } from "next/navigation";

// The GitHub profile lives in the "Hồ sơ năng lực" tab of /profile; old links land there.
export default async function GithubProfileRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const params = (await searchParams) ?? {};
  const error = typeof params.error === "string" ? params.error : null;
  const query = new URLSearchParams({ tab: "nang-luc" });
  if (error) query.set("error", error);
  redirect(`/profile?${query.toString()}`);
}
