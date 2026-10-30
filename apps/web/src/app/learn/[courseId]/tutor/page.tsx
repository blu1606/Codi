import { redirect } from "next/navigation";

// The Tutor has one full page for every screen; old per-course links land there.
export default function TutorRoute() {
  redirect("/ai");
}
