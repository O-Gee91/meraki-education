import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { FileLibrary } from "@/components/files/FileLibrary";

export const Route = createFileRoute("/_authenticated/files")({
  head: () => ({
    meta: [
      { title: "Files & resources — Meraki Education" },
      {
        name: "description",
        content:
          "Shared school library for spreadsheets, PDFs, documents, video and audio resources.",
      },
      { property: "og:title", content: "Files & resources — Meraki Education" },
      {
        property: "og:description",
        content:
          "Shared school library for spreadsheets, PDFs, documents, video and audio resources.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FilesPage,
});

function FilesPage() {
  return (
    <AppShell
      desktopReview
      title="Files & resources"
      description="School-wide library for staff, students and guardians — upload handbooks, forms, slides, video and more."
    >
      <FileLibrary desktopReview emptyLabel="No school-wide files yet. Upload the first resource." />
    </AppShell>
  );
}
