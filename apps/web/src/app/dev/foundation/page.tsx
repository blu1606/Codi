import { notFound } from "next/navigation";
import FoundationPreview from "./preview";

export default function FoundationPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <FoundationPreview />;
}
