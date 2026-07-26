import { ModuleStub } from '@/components/ModuleStub';

export default function SettingsPage() {
  return (
    <ModuleStub
      title="Settings"
      description="Configurable system settings (Super Admin / limited Admin)."
      endpoint="/settings"
    />
  );
}
