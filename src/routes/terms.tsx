import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";
import { LEGAL } from "@/components/legal/legal-info";

const URL = "https://meraki-education.app/terms";
const TITLE = "Terms of Service — Meraki Education";
const DESC = "The rules for using Meraki Education at school: accounts, acceptable use and limitations.";

export const Route = createFileRoute("/terms")({
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
  component: Terms,
});

function Terms() {
  return (
    <LegalPage title="Terms of Service">
      <section>
        <p>These terms cover use of Meraki, provided by {LEGAL.operator} for school use. By signing in, you agree to them and to your school's own rules.</p>
      </section>
      <section>
        <h2>Accounts</h2>
        <ul>
          <li>Accounts are for students, guardians, teachers and staff of a participating school.</li>
          <li>Keep your password and sign-in codes private. Do not share accounts.</li>
          <li>Tell your teacher or school administrator if you think someone else used your account.</li>
          <li>Your school may require two-step sign-in.</li>
        </ul>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <ul>
          <li>Be respectful in discussions, messages and the class community. No bullying, slurs, threats or harassment.</li>
          <li>Only submit your own work, and do not post other people's private information.</li>
          <li>Do not try to see records you are not meant to see, or interfere with the service.</li>
          <li>Staff may remove posts and review removed content to keep students safe.</li>
        </ul>
      </section>
      <section>
        <h2>School records</h2>
        <p>Grades, attendance and other records belong to the school. Teachers decide when grades are posted. Official report cards come from the school.</p>
      </section>
      <section>
        <h2>Limitations</h2>
        <p>We work to keep Meraki available and accurate, but it is provided as is and may sometimes be unavailable. AI-suggested feedback is a draft for teachers to review. If a grade or record looks wrong, ask your teacher or school.</p>
      </section>
      <section>
        <h2>Changes and ending access</h2>
        <p>We may update these terms and will change the date above. Schools can remove accounts, and accounts that break these rules may be suspended.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p><a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a></p>
      </section>
    </LegalPage>
  );
}
