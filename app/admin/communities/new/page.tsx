import { CommunityForm } from "@/components/admin/community-form";
import { requireAdminUser } from "@/lib/admin-auth";

export default async function AdminNewCommunityPage() {
  await requireAdminUser();
  return <CommunityForm mode="create" />;
}
