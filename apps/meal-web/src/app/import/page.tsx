import { ModuleStub } from '@/components/ModuleStub';

export default function ImportPage() {
  return (
    <ModuleStub
      title="Excel Import"
      description="Bulk student import stub — validate → preview → confirm pipeline next."
      endpoint="/import/history"
    />
  );
}
