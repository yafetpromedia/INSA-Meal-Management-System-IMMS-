import { ModuleStub } from '@/components/ModuleStub';

export default function UsersPage() {
  return (
    <ModuleStub
      title="Mentors & Food Staff"
      description="User roles for meal distribution: mentors, food staff, admins."
      endpoint="/users"
    />
  );
}
