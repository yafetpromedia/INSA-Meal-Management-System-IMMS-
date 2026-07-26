import { ModuleStub } from '@/components/ModuleStub';

export default function MealsPage() {
  return (
    <ModuleStub
      title="Meal Distribution"
      description="Barcode verification, configurable sessions, and duplicate prevention."
      endpoint="/meals/today-stats"
    />
  );
}
