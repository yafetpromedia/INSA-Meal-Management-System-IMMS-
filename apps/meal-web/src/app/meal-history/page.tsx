import { ModuleStub } from '@/components/ModuleStub';

export default function MealHistoryPage() {
  return (
    <ModuleStub
      title="Meal History"
      description="Complete meal timeline by student, campus, program, and session."
      endpoint="/meals/history"
    />
  );
}
