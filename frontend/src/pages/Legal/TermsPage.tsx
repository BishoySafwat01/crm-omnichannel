import React from 'react';
import { LegalLayout } from './LegalLayout';
import { FileCheck, ShieldAlert, Scale, Clock } from 'lucide-react';

export const TermsPage: React.FC = () => {
  return (
    <LegalLayout title="Terms of Service" activeTab="terms">
      {/* Header Metadata Banner */}
      <div className="border-b border-slate-200 pb-6 mb-8">
        <span className="inline-block text-xs font-bold uppercase tracking-wider text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded mb-3">
          Commercial B2B SaaS Agreement
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight mb-3">
          Terms of Service
        </h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-slate-500 pt-2">
          <div>
            <strong className="text-slate-700 block">Issuing Entity:</strong>
            LUXIRA KOZMETİK TİCARET LTD. ŞTİ.
          </div>
          <div>
            <strong className="text-slate-700 block">Tax Registry:</strong>
            VKN 6091375815 (Kocasinan)
          </div>
          <div>
            <strong className="text-slate-700 block">Compliance Standard:</strong>
            Meta Developer Policies v23.0
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
          <FileCheck className="w-5 h-5 text-teal-600" />
          1. Acceptance of Terms & Contracting Parties
        </h2>
        <p className="text-slate-700 leading-relaxed">
          These Terms of Service (&ldquo;Terms&rdquo;) constitute a legally binding agreement entered into between{' '}
          <strong>LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ</strong> (operating as <strong>Luxira Holding LLC</strong>, registered at Şirinevler Mah. Meriç Sk. No: 15 Bahçelievler / İstanbul, Turkey, Tax ID: VKN 6091375815, hereinafter &ldquo;Company&rdquo;, &ldquo;we&rdquo;, or &ldquo;us&rdquo;) and the business entity or commercial subscriber (&ldquo;Customer&rdquo;, &ldquo;Subscriber&rdquo;, or &ldquo;you&rdquo;) accessing the{' '}
          <strong>LUXIRA Omnichannel Communications Platform</strong> at{' '}
          <a href="https://webluxira.com" className="text-teal-700 font-semibold underline">https://webluxira.com</a>.
        </p>
        <p className="text-slate-700 leading-relaxed">
          By registering an organization account, connecting third-party messaging channels, or utilizing the Service, you warrant that you possess full corporate authority to bind your organization to these Terms.
        </p>
      </section>

      {/* Section 2 */}
      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2">
          2. Description of the Service
        </h2>
        <p className="text-slate-700 leading-relaxed">
          LUXIRA CRM provides software enabling commercial enterprises to aggregate, triage, route, and respond to customer inquiries originating from connected channels—including Facebook Messenger and Instagram Direct via official Meta Graph API v23.0—in a collaborative agent workspace.
        </p>
      </section>

      {/* Section 3 */}
      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-teal-600" />
          3. Strict Compliance with Meta Platform Terms & Commercial Rules
        </h2>
        <p className="text-slate-700 leading-relaxed">
          Subscribers connecting Facebook Pages or Instagram Business Accounts explicitly covenant and agree:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-slate-700 text-sm sm:text-base">
          <li>
            <strong>Adherence to Meta Terms:</strong> Customer shall comply at all times with the <em>Meta Platform Terms</em>, <em>Developer Policies</em>, and <em>Commercial Messaging Guidelines</em>.
          </li>
          <li>
            <strong>24-Hour Messaging Window Compliance:</strong> Standard customer-care messaging through Meta Graph API is restricted to a 24-hour response window following user-initiated interaction. Responses dispatched after the 24-hour window must strictly utilize approved Meta message tags (such as <code>HUMAN_AGENT</code>) solely for human-driven responses to existing inquiries within 7 calendar days.
          </li>
          <li>
            <strong>Absolute Prohibition Against Unsolicited Messaging:</strong> The Service shall never be used to dispatch unsolicited commercial messages, bulk advertising broadcasts, deceptive marketing campaigns, or spam to Meta platform users.
          </li>
          <li>
            <strong>Consent &amp; Opt-In Safeguards:</strong> Customer is solely responsible for obtaining and verifying all legally mandated consents, disclosures, and opt-ins required under applicable consumer protection statutes (TCPA, CAN-SPAM, GDPR) prior to initiating communications.
          </li>
          <li>
            <strong>Termination for Policy Abuse:</strong> Luxira Holding reserves the right to immediately suspend or terminate access to the Service for any Customer verified to have violated Meta messaging policies or terms of service.
          </li>
        </ul>
      </section>

      {/* Section 4 */}
      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2">
          4. Acceptable Use Policy (AUP)
        </h2>
        <p className="text-slate-700 leading-relaxed">
          When accessing or operating LUXIRA CRM, Customer and its authorized users agree not to:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-slate-700 text-sm sm:text-base">
          <li>Transmit, distribute, or store any material that is defamatory, fraudulent, harassing, obscene, hateful, or in violation of intellectual property rights.</li>
          <li>Attempt to reverse engineer, decompile, disassemble, or derive source code from any portion of the platform or backend services.</li>
          <li>Probe, scan, or test the vulnerability of the system without prior explicit written authorization from Luxira Holding security engineers.</li>
          <li>Bypass, disable, or circumvent any rate limiting, authentication, or access control mechanisms implemented across the platform.</li>
          <li>Use automated scripts, bots, or unapproved scrapers to extract conversational data, metrics, or proprietary system layouts.</li>
        </ul>
      </section>

      {/* Section 5 */}
      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2">
          5. Intellectual Property Rights & Data Ownership
        </h2>
        <p className="text-slate-700 leading-relaxed">
          <strong>Platform Ownership:</strong> LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ retains all right, title, and interest in and to the LUXIRA CRM software, user interfaces, database designs, proprietary algorithms, documentation, brand trademarks, and logos.
        </p>
        <p className="text-slate-700 leading-relaxed">
          <strong>Customer Data Ownership:</strong> Customer retains all proprietary rights, title, and interest in and to conversational content, message history, customer profiles, and business media uploaded or routed through the Service. Customer grants Company a non-exclusive, royalty-free, limited license to host, cache, and transmit Customer Data solely to the extent necessary to deliver the contracted services.
        </p>
      </section>

      {/* Section 6 */}
      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
          <Clock className="w-5 h-5 text-teal-600" />
          6. 90-Day Retention Cycle & Lifecycle Cleanup
        </h2>
        <p className="text-slate-700 leading-relaxed">
          Customer explicitly acknowledges and agrees that customer chat transcripts, media attachments, and Page-Scoped IDs are retained for an operational lifecycle of <strong>exactly 90 calendar days</strong>. Following the conclusion of this 90-day period, all conversational data is automatically and irreversibly expunged from production databases. Customer is responsible for exporting any records required for long-term compliance prior to lifecycle expiration.
        </p>
      </section>

      {/* Section 7 */}
      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2">
          7. Service Availability, SLA & Third-Party Dependencies
        </h2>
        <p className="text-slate-700 leading-relaxed">
          <strong>Uptime Commitment:</strong> Company targets an operational service uptime of 99.5% for the core CRM inbox, excluding scheduled maintenance windows announced in advance.
        </p>
        <p className="text-slate-700 leading-relaxed">
          <strong>Third-Party Platform Disclaimer:</strong> Customer acknowledges that the Service relies upon external APIs and webhooks operated by Meta Platforms, Inc. Company shall not be held liable for communication delays, undelivered messages, or temporary service disruptions resulting directly from Meta Graph API downtimes, rate-limiting restrictions, platform policy changes, or telecommunication outages outside Company&rsquo;s reasonable control.
        </p>
      </section>

      {/* Section 8 & 9 */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
          <Scale className="w-5 h-5 text-teal-600" />
          8. Governing Law & Dispute Resolution
        </h2>
        <p className="text-slate-700 leading-relaxed">
          These Terms shall be governed by and construed in accordance with the substantive commercial laws of the Republic of Turkey. Any dispute, controversy, or claim arising out of or relating to these Terms shall be submitted to the exclusive jurisdiction of the competent Commercial Courts and Execution Offices of Istanbul (Bakırköy / Çağlayan), Turkey.
        </p>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mt-4 text-xs sm:text-sm text-slate-600 space-y-1">
          <p className="font-bold text-slate-900 text-base">Corporate Legal Notices:</p>
          <p>LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ &mdash; Legal Affairs</p>
          <p>Headquarters: Şirinevler Mah. Meriç Sk. No: 15 Bahçelievler / İstanbul, Turkey</p>
          <p>Tax Identification: VKN 6091375815 (Kocasinan Vergi Dairesi)</p>
          <p>Legal Inquiries: <a href="mailto:privacy@webluxira.com" className="text-teal-700 underline font-semibold">privacy@webluxira.com</a></p>
          <p>Support: <a href="mailto:support@webluxira.com" className="text-teal-700 underline font-semibold">support@webluxira.com</a></p>
        </div>
      </section>
    </LegalLayout>
  );
};
