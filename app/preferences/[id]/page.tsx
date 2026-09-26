import PreferenceCenterPublic from "@/app/ui/preference-center-public";

export default async function PublicPreferenceCenterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ user?: string; token?: string; locale?: string }> }) {
  const { id } = await params; const query = await searchParams;
  return <PreferenceCenterPublic centerId={id} userId={query.user ?? ""} token={query.token ?? ""} locale={query.locale ?? "en"}/>;
}
