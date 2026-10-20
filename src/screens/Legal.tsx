import { Link } from 'react-router-dom'

function LegalLayout({ kind }: { kind: 'privacy' | 'terms' }) {
  const privacy = kind === 'privacy'
  return (
    <article className="legal-page">
      <p className="legal-kicker">QUORLYTH · {privacy ? 'PRIVACY' : 'TERMS'}</p>
      <h1>{privacy ? 'Privacy policy' : 'Terms of service'}</h1>
      <p className="legal-updated">Draft for review · October 20, 2026</p>
      <p className="legal-draft">
        This is a working draft, not a final legal notice. The product owner should verify the data flows,
        service providers, retention rules, contact details, and applicable law before treating this page as
        the binding policy for Quorlyth.
      </p>
      {privacy ? (
        <div className="legal-content">
          <section>
            <h2>What this draft covers</h2>
            <p>Quorlyth helps creators organise communities, discuss ideas, collaborate, review contributions, and choose what to promote. Depending on the features you use, the service may process account and profile details, community membership, ideas and comments, conversations, uploaded files, collaboration requests, and preferences.</p>
          </section>
          <section>
            <h2>How information may be used</h2>
            <ul>
              <li>To create and secure accounts and provide the features you request.</li>
              <li>To show community content to the people authorised to access it.</li>
              <li>To support idea review, collaboration, contributor attribution, and promotion workflows.</li>
              <li>To maintain reliability, prevent abuse, troubleshoot errors, and protect the service.</li>
            </ul>
          </section>
          <section>
            <h2>AI processing and sharing</h2>
            <p>When AI-assisted features are used, relevant prompts and content may be sent to configured AI service providers to generate a response or assessment. The final policy must identify the actual providers in use, describe their applicable data handling terms, and explain which content is sent to each provider. Do not submit information you are not authorised to share.</p>
          </section>
          <section>
            <h2>Storage, retention, and security</h2>
            <p>Quorlyth uses its configured hosting, application, and data services to operate the product. The final policy must identify those services, define how long account data and user content are retained, explain deletion and backup handling, and state how users can request access, correction, export, or deletion where applicable.</p>
          </section>
          <section>
            <h2>Your choices and questions</h2>
            <p>Use the account and profile controls available in Quorlyth where supported. A verified privacy contact and the process for privacy requests must be added by the operator before this draft is published as final.</p>
          </section>
        </div>
      ) : (
        <div className="legal-content">
          <section>
            <h2>Using Quorlyth</h2>
            <p>You are responsible for the account you use and for ensuring that information you submit is accurate enough for the feature involved. Use the service lawfully and do not attempt to access accounts, communities, or content without permission.</p>
          </section>
          <section>
            <h2>Community content and permissions</h2>
            <p>You retain whatever rights you hold in the content you submit. You must have the necessary rights and permissions to share it. Community owners and authorised reviewers may process contributions to operate their spaces and review ideas. The final terms should define the exact licence needed to host, display, review, and promote that content.</p>
          </section>
          <section>
            <h2>Contributor credit and publication</h2>
            <p>Quorlyth is designed to keep contributions attributed through idea review and promotion. AI-assisted assessments are decision-support tools; they do not guarantee that an idea will be selected, accurate, achievable, or suitable for publication. Creators remain responsible for their publication decisions and for respecting contributor rights.</p>
          </section>
          <section>
            <h2>Availability and account restrictions</h2>
            <p>Features may change as the service develops. Access may be restricted where needed to protect users, investigate abuse, or comply with applicable requirements. The final terms should specify suspension, termination, warranties, liability, governing law, and any consumer rights that cannot legally be excluded.</p>
          </section>
          <section>
            <h2>Questions and final terms</h2>
            <p>A verified contact address, governing-law jurisdiction, effective date, dispute process, and any required company/operator details must be added before this draft is adopted as the binding terms for Quorlyth.</p>
          </section>
        </div>
      )}
      <Link className="legal-back" to="/">← Back to Quorlyth</Link>
    </article>
  )
}

export function Privacy() {
  return <LegalLayout kind="privacy" />
}

export function Terms() {
  return <LegalLayout kind="terms" />
}
