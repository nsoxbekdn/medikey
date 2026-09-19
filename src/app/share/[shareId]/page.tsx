import { ProviderPortal } from "@/components/provider/ProviderPortal";

// Never pre-render or cache the provider portal shell.
export const dynamic = "force-dynamic";

export default async function SharePortalPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  return <ProviderPortal shareId={shareId} />;
}
