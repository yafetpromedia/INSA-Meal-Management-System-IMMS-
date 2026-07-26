import { ModuleStub } from '@/components/ModuleStub';

export default function AuditLogsPage() {
  return (
    <ModuleStub
      title="Audit Logs"
      description="Permission-sensitive actions with full traceability."
      endpoint="/audit-logs"
    />
  );
}
