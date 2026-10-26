import { redirect } from "next/navigation";

export default async function LegacyCheckoutPage({
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ order?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const order = resolvedSearchParams?.order;
  if (order) {
    redirect(`/checkout?order=${encodeURIComponent(order)}`);
  }
  redirect("/checkout");
}
