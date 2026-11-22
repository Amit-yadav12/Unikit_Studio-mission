import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { PageHeader } from "@/components/ui/Layout";
import { DocumentsStudio } from "@/features/documents/DocumentsStudio";

export default function DocumentsPage() {
  return (
    <WorkspaceShell title="PDF & PowerPoint Studio" context="Local document conversion and optimization in this browser tab">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <PageHeader
          eyebrow="Documents"
          title="PDF & PowerPoint Studio"
          description="Compress, convert and export PDF and modern PowerPoint files. Every document stays on this device; visual conversions and fidelity limits are shown clearly."
        />
        <DocumentsStudio />
      </div>
    </WorkspaceShell>
  );
}
