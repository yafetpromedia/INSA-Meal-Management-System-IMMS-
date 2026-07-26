import { ModuleStub } from '@/components/ModuleStub';

export default function OrganizationsPage() {
  return (
    <ModuleStub
      title="Organizations"
      description="Multi-tenant root. Each organization has its own campuses, programs, years, schedules, and modules."
      endpoint="/organizations"
    />
  );
}
