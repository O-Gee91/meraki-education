import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";
import { LEGAL } from "@/components/legal/legal-info";

const URL = "https://meraki-education.app/privacy";
const TITLE = "Privacy Policy — Meraki Education";
const DESC = "How Meraki Education collects, uses, protects and keeps student, guardian and teacher information.";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <section>
        <p>
          {LEGAL.operator} runs Meraki, a school platform used by teachers, students, guardians and
          school administrators. This policy explains what information we keep, who can see it and how
          it is protected. Meraki is provided to schools; the school decides who gets an account.
        </p>
      </section>
      <section>
        <h2>Information we keep</h2>
        <ul>
          <li><strong>Students:</strong> name, student ID, school email or username, grade level, classes, assignments and submitted work, grades and teacher feedback, attendance, behavior notes, class discussion posts, and private well-being check-ins. A student ID is an education record. It is not directory information, and it is not shown on student or guardian screens.</li>
          <li><strong>Guardians:</strong> name, email and the students they are linked to.</li>
          <li><strong>Teachers and administrators:</strong> name, school email, classes taught, and the records they create.</li>
          <li><strong>Account security:</strong> sign-in times and two-step sign-in settings (authenticator or passkey). Passwords are never stored in readable form.</li>
        </ul>
      </section>
      <section>
        <h2>Who can see what</h2>
        <ul>
          <li>Students see their own work and only grades and feedback a teacher has posted — never drafts.</li>
          <li>Guardians see posted grades, assignments and attendance for their own linked children only.</li>
          <li>Teachers see the students in classes they teach or co-teach.</li>
          <li>Well-being check-ins are private to the student and the staff responsible for supporting them.</li>
          <li>School administrators can see school-wide records to run the school.</li>
        </ul>
        <p>Access rules are enforced by the database itself, not just by the screens you see.</p>
      </section>
      <section>
        <h2>How we use information</h2>
        <p>Only to run the school platform: grading, attendance, messaging, reports and support. We do not sell information, show advertising, or build marketing profiles of students.</p>
      </section>
      <section>
        <h2>Service providers</h2>
        <ul>
          <li><strong>Lovable Cloud</strong> (hosting, database, sign-in and file storage), which runs on Supabase infrastructure.</li>
          <li><strong>Email delivery</strong> for password resets and school notifications, sent from notify.meraki-education.app.</li>
          <li><strong>AI feedback assistant:</strong> when a teacher asks for a suggested comment, the score, rubric details and teacher notes for that piece of work are sent to an AI model through the Lovable AI Gateway to draft wording. The teacher reviews it before anything is saved.</li>
          <li><strong>Visitor analytics:</strong> Lovable records which pages are visited, where visitors came from, their country, browser, operating system and device type, how long they stay, how fast pages load, errors, and which buttons and links are clicked. It uses no cookies, stores nothing on your device, doesn't keep IP addresses and doesn't identify visitors. This is recorded for every visitor. Detailed data is kept for 90 days and daily summaries for a year. Lovable collects this data for us. <a href="https://lovable.dev/privacy">Lovable's privacy policy</a> explains how it handles it.</li>
          <li><strong>Google Fonts</strong> supplies the page fonts, so your browser contacts Google to load them.</li>
        </ul>
        <p>Your browser also stores your sign-in session and your chosen display theme on your device so you stay signed in.</p>
      </section>
      <section>
        <h2>Security</h2>
        <ul>
          <li>All connections use HTTPS.</li>
          <li>Optional or school-required two-step sign-in with an authenticator app or passkey.</li>
          <li>Role-based access limits on every record.</li>
          <li>Deleted discussion posts are kept in a staff-only audit record so the school can review safety concerns.</li>
        </ul>
      </section>
      <section>
        <h2>How long we keep information</h2>
        <p>Records are kept while the school uses Meraki and as the school needs for its academic records. When a student moves classes, earlier grades stay with their record. A student ID is kept after the student withdraws, transfers, or graduates, so the school can still find the record. An ID that is corrected or destroyed is retired and is never given to another student. A school can ask us to delete or export its information.</p>
      </section>
      <section>
        <h2>Your choices</h2>
        <p>Students and guardians can ask their school to review, correct or delete information. Schools can contact us directly.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>Questions about privacy: <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a></p>
      </section>
    </LegalPage>
  );
}
