import React from 'react';
import { LegalLayout } from './LegalLayout';
import { Shield, Lock, Server, Clock, CheckCircle2, FileText } from 'lucide-react';

export const PrivacyPolicyPage: React.FC = () => {
  return (
    <LegalLayout title="Privacy Policy" activeTab="privacy">
      {/* Header Metadata Banner */}
      <div className="border-b border-slate-200 pb-6 mb-8">
        <span className="inline-block text-xs font-bold uppercase tracking-wider text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded mb-3">
          Official Corporate Disclosure
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight mb-3">
          Privacy Policy
        </h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-slate-500 pt-2">
          <div>
            <strong className="text-slate-700 block">Operating Legal Entity:</strong>
            LUXIRA KOZMETİK TİCARET LTD. ŞTİ.
          </div>
          <div>
            <strong className="text-slate-700 block">Tax Registry:</strong>
            VKN 6091375815 (Kocasinan)
          </div>
          <div>
            <strong className="text-slate-700 block">API Framework:</strong>
            Meta Graph API v23.0
          </div>
          <div>
            <strong className="text-slate-700 block">Effective Date:</strong>
            September 7, 2026
          </div>
        </div>
      </div>

      {/* Section 1 */}
      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
          <Shield className="w-5 h-5 text-teal-600" />
          1. Corporate Identity & Legal Disclosures
        </h2>
        <p className="text-slate-700 leading-relaxed">
          This Privacy Policy governs the access, collection, processing, storage, and automated lifecycle erasure of personal data by{' '}
          <strong>LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ</strong> (operating as <strong>Luxira Holding LLC</strong>, hereinafter &ldquo;Company&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) in operation of the{' '}
          <strong>LUXIRA Omnichannel Communications Platform</strong> (hosted at{' '}
          <a href="https://webluxira.com" className="text-teal-700 font-semibold underline">https://webluxira.com</a>).
        </p>

        <div className="overflow-x-auto rounded-lg border border-slate-200 mt-3">
          <table className="min-w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5">Corporate Attribute</th>
                <th className="px-4 py-2.5">Verified Registry Disclosure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr>
                <td className="px-4 py-2.5 font-semibold">Registered Corporate Entity</td>
                <td className="px-4 py-2.5">LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ (trading as Luxira Holding LLC)</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-semibold">Tax Identification (VKN)</td>
                <td className="px-4 py-2.5">VKN 6091375815 &mdash; Kocasinan Vergi Dairesi, Istanbul, Turkey</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-semibold">Headquarters &amp; Registered Office</td>
                <td className="px-4 py-2.5">Şirinevler Mah. Meriç Sk. No: 15 Bahçelievler / İstanbul, Turkey</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-semibold">Data Controller &amp; Privacy Officer</td>
                <td className="px-4 py-2.5">
                  <a href="mailto:privacy@webluxira.com" className="text-teal-700 underline font-medium">privacy@webluxira.com</a>{' '}
                  (Fallback: <a href="mailto:support@webluxira.com" className="text-teal-700 underline font-medium">support@webluxira.com</a>)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 2 */}
      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2">
          2. Scope of Service & Meta Graph API v23.0 Integration
        </h2>
        <p className="text-slate-700 leading-relaxed">
          LUXIRA CRM provides enterprise customer communications infrastructure enabling businesses to aggregate, route, triage, and resolve customer support inquiries originating from{' '}
          <strong>Facebook Messenger</strong> and <strong>Instagram Direct</strong> via official programmatic integration with the{' '}
          <strong>Meta Graph API v23.0</strong>.
        </p>
        <p className="text-slate-700 leading-relaxed">
          Our platform operates strictly as a <em>Data Processor</em> executing communications triage on behalf of subscriber organizations, who maintain ownership and act as independent <em>Data Controllers</em>.
        </p>
      </section>

      {/* Section 3 */}
      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
          <FileText className="w-5 h-5 text-teal-600" />
          3. Specific Meta Graph API Permissions & Functional Scope
        </h2>
        <p className="text-slate-700 leading-relaxed">
          In strict adherence to Meta Platform Developer Policies, LUXIRA CRM requests and utilizes only the minimum necessary permissions required to fulfill authorized customer support workflows:
        </p>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5">Meta Permission</th>
                <th className="px-4 py-2.5">Technical Purpose</th>
                <th className="px-4 py-2.5">Data Processed</th>
                <th className="px-4 py-2.5">Messaging Window Rule</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr>
                <td className="px-4 py-3 font-mono text-xs font-bold text-teal-800">pages_messaging</td>
                <td className="px-4 py-3">Ingesting customer queries sent to connected Facebook Pages and transmitting agent replies in real time.</td>
                <td className="px-4 py-3">Inbound/outbound text, attachments, timestamps, conversation thread IDs.</td>
                <td className="px-4 py-3">24-hour customer service window; <code>HUMAN_AGENT</code> tag for responses within 7 calendar days.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs font-bold text-teal-800">pages_show_list</td>
                <td className="px-4 py-3">Enabling authenticated corporate administrators to enumerate and connect the specific Pages they manage.</td>
                <td className="px-4 py-3">Page ID, Page Name, administrative status flags.</td>
                <td className="px-4 py-3">Admin OAuth consent flow; only explicitly chosen pages are connected.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs font-bold text-teal-800">pages_read_engagement</td>
                <td className="px-4 py-3">Ingesting delivery receipts, read status indicators, and thread timestamps for conversational triage.</td>
                <td className="px-4 py-3">Delivery status flags, read timestamps, interaction counts.</td>
                <td className="px-4 py-3">Used exclusively for agent SLA triage; zero behavioral profiling.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs font-bold text-teal-800">pages_manage_metadata</td>
                <td className="px-4 py-3">Automating webhook subscriptions for connected Pages (<code>messages</code>, <code>messaging_postbacks</code>).</td>
                <td className="px-4 py-3">Webhook subscription endpoints, callback verify tokens.</td>
                <td className="px-4 py-3">Technical routing infrastructure; no customer personal information accessed.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 4 */}
      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2">
          4. Categories of Data Accessed & Operational Purpose
        </h2>
        <ul className="list-disc pl-6 space-y-2 text-slate-700 text-sm sm:text-base">
          <li>
            <strong>Page-Scoped Identifiers (PSID / IGSID):</strong> Cryptographically isolated identifiers generated by Meta to route conversations. They do not reveal personal telephone numbers, national ID numbers, or personal profile credentials.
          </li>
          <li>
            <strong>Message Payloads:</strong> Content of text inquiries, photos, audio voice notes, video clips, and document attachments sent by consumers to connected business Pages.
          </li>
          <li>
            <strong>Sender Display Name:</strong> First name and last name provided in the public Meta profile payload.
          </li>
          <li>
            <strong>Operational Support Logs:</strong> Internal ticket tags, agent assignments, and resolution timestamps generated by CRM operators.
          </li>
        </ul>
        <p className="text-slate-700 leading-relaxed text-sm sm:text-base">
          <strong>Strict Purpose:</strong> All data is processed exclusively for routing, triaging, and resolving customer inquiries via the internal CRM team inbox.
        </p>
      </section>

      {/* Section 5 */}
      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2">
          5. Purpose Limitation & Strict Zero-Sale Guarantee (Meta Terms Section 4.a)
        </h2>
        <div className="bg-slate-50 border-l-4 border-teal-600 p-4 rounded-r-lg space-y-2">
          <p className="font-bold text-slate-900 text-sm">Core Platform Terms Commitment:</p>
          <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-slate-700">
            <li><strong>Zero-Sale Guarantee:</strong> LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ does not sell, lease, rent, trade, or monetize customer conversation data or Meta platform data under any circumstances.</li>
            <li><strong>No Commercial Profiling:</strong> We do not construct consumer behavioral profiles, psychological scores, or audience segmentation models.</li>
            <li><strong>Zero Behavioral Advertising:</strong> Message contents and customer identifiers are never utilized to serve or optimize targeted advertisements.</li>
            <li><strong>No AI Model Harvesting:</strong> Customer chat records are strictly isolated and are never used to train public foundation models or third-party artificial intelligence systems.</li>
          </ul>
        </div>
      </section>

      {/* Section 6 */}
      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
          <Clock className="w-5 h-5 text-teal-600" />
          6. Strict 90-Day Retention & Automated Purging Policy
        </h2>
        <p className="text-slate-700 leading-relaxed">
          In strict alignment with data minimization principles and Meta Platform Policies:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-slate-700 text-sm sm:text-base">
          <li>
            <strong>90-Day Lifecycle:</strong> Ingested chat logs, conversation transcripts, Page-Scoped IDs, and media attachments are retained in active database storage for an operational lifecycle of <strong>exactly ninety (90) calendar days</strong> from the latest message in the thread.
          </li>
          <li>
            <strong>Automated Hard Purge:</strong> Upon reaching 90 days, automated database jobs permanently excise all conversation records, attachments, and customer identifiers from PostgreSQL databases and encrypted storage volumes.
          </li>
          <li>
            <strong>Early Deletion on Demand:</strong> End-users maintain the right to trigger an immediate hard purge at any time via our Data Deletion procedures, executed within 48 business hours.
          </li>
        </ul>
      </section>

      {/* Section 7 */}
      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
          <Lock className="w-5 h-5 text-teal-600" />
          7. Technical Security Measures & Sub-Processors (Meta Terms Section 4.b)
        </h2>
        <ul className="list-disc pl-6 space-y-2 text-slate-700 text-sm sm:text-base">
          <li><strong>In-Transit Encryption:</strong> All data transfers strictly utilize TLS 1.3 / modern HTTPS with strong cipher suites.</li>
          <li><strong>At-Rest Encryption:</strong> PostgreSQL databases and storage volumes are secured using AES-256 disk encryption. Meta tokens are secured with Fernet symmetric cryptography.</li>
          <li><strong>Role-Based Access Control (RBAC):</strong> Strict privilege separation limiting chat thread visibility exclusively to authenticated, authorized team members.</li>
        </ul>

        <div className="overflow-x-auto rounded-lg border border-slate-200 mt-3">
          <table className="min-w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5">Sub-Processor</th>
                <th className="px-4 py-2.5">Service Function</th>
                <th className="px-4 py-2.5">Data Center Region</th>
                <th className="px-4 py-2.5">Compliance Accreditations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr>
                <td className="px-4 py-2.5 font-semibold">Amazon Web Services, Inc. (AWS)</td>
                <td className="px-4 py-2.5">Encrypted cloud compute, managed PostgreSQL database hosting.</td>
                <td className="px-4 py-2.5">Frankfurt (Germany) &amp; Ireland (EU)</td>
                <td className="px-4 py-2.5">ISO 27001, SOC 1/2/3, GDPR DPA</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-semibold">Cloudflare, Inc.</td>
                <td className="px-4 py-2.5">Edge DDoS mitigation, Web Application Firewall (WAF), TLS reverse proxy.</td>
                <td className="px-4 py-2.5">Global Edge (EU Data Localization)</td>
                <td className="px-4 py-2.5">ISO 27001, SOC 2 Type II, GDPR DPA</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 8 */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2">
          8. User Rights & Data Deletion Portal (Meta Terms Section 4.d)
        </h2>
        <p className="text-slate-700 leading-relaxed text-sm sm:text-base">
          In accordance with Section 4.d of the Meta Platform Terms, GDPR Article 17, and CCPA, users have the absolute right to request permanent erasure of their data at any time. Visit our dedicated{' '}
          <a href="/data-deletion" className="text-teal-700 font-bold underline">User Data Deletion Portal</a> to initiate removal or verify deletion status.
        </p>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mt-4 text-xs sm:text-sm text-slate-600 space-y-1">
          <p className="font-bold text-slate-900 text-base">Contact Data Protection Officer:</p>
          <p>LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ &mdash; Privacy &amp; Legal Affairs</p>
          <p>Headquarters: Şirinevler Mah. Meriç Sk. No: 15 Bahçelievler / İstanbul, Turkey</p>
          <p>Tax Identification: VKN 6091375815 (Kocasinan Vergi Dairesi)</p>
          <p>Direct Inquiries: <a href="mailto:privacy@webluxira.com" className="text-teal-700 underline font-semibold">privacy@webluxira.com</a></p>
        </div>
      </section>
    </LegalLayout>
  );
};
