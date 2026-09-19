import { ProviderPortal } from "@/components/provider/ProviderPortal";

export default async function SharePortalPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  return <ProviderPortal shareId={shareId} />;
}
