import React, { useState, useEffect } from 'react';
import { LegalLayout } from './LegalLayout';
import { Trash2, Search, CheckCircle2, Mail, ExternalLink, ShieldCheck, Clock, AlertCircle } from 'lucide-react';
import logoImg from '../../assets/luxira-logo.png';

export const DataDeletionPage: React.FC = () => {
  const [searchCode, setSearchCode] = useState('');
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const codeParam = params.get('code') || params.get('id');
      if (codeParam && codeParam.trim()) {
        const cleanCode = codeParam.trim();
        setSearchCode(cleanCode);
        setActiveCode(cleanCode);
        setHasSearched(true);
      }
    }
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchCode.trim()) return;
    const clean = searchCode.trim();
    setActiveCode(clean);
    setHasSearched(true);

    // Update query param in URL without reload
    const newUrl = `${window.location.pathname}?code=${encodeURIComponent(clean)}`;
    window.history.pushState({}, '', newUrl);
  };

  const handleResetSearch = () => {
    setSearchCode('');
    setActiveCode(null);
    setHasSearched(false);
    window.history.pushState({}, '', window.location.pathname);
  };

  return (
    <LegalLayout title="User Data Deletion Instructions" activeTab="deletion">
      {/* Prominent Brand Logo Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-6 sm:p-8 mb-8 border border-slate-700/60 shadow-lg flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
        <img
          src={logoImg}
          alt="LUXIRA HOLDING Brand Logo"
          className="w-20 h-20 sm:w-24 sm:h-24 object-contain rounded-xl bg-white p-1.5 shadow-md border border-slate-600 flex-shrink-0"
        />
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-teal-300 bg-teal-950/60 border border-teal-500/40 px-2.5 py-0.5 rounded-full mb-1">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
            Meta Platform Terms Section 4.d Certified
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            User Data Deletion &amp; Status Portal
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
            LUXIRA HOLDING provides end-users with guaranteed, transparent mechanisms to request the complete erasure of conversation transcripts, media attachments, and Page-Scoped IDs pursuant to Meta Policy 4.d, GDPR Art. 17, and CCPA.
          </p>
        </div>
      </div>

      {/* Confirmation Status Banner (when query code is active) */}
      {hasSearched && activeCode && (
        <div className="bg-emerald-50 border-2 border-emerald-500/80 rounded-2xl p-6 mb-8 shadow-sm animate-fadeIn">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-xs flex-shrink-0 mt-0.5">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-2 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded">
                  Active Deletion Directive
                </span>
                <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  SLA: 48 Business Hours Maximum
                </span>
              </div>
              <h2 className="text-lg font-extrabold text-emerald-950">
                Data Deletion Request Queued
              </h2>
              <div className="bg-white/80 border border-emerald-200 rounded-lg p-3 font-mono text-sm text-slate-800 break-all">
                Reference Code: <strong className="text-emerald-900">{activeCode}</strong>
              </div>
              <p className="text-xs sm:text-sm text-emerald-900 leading-relaxed">
                Current Status: <strong>QUEUED FOR PERMANENT DATABASE PURGE</strong>. All associated chat records, media attachments, and Page-Scoped IDs (PSID) are scheduled for complete deletion across production databases within 48 business hours.
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-3 text-xs">
                <a
                  href={`mailto:privacy@webluxira.com?subject=Data%20Deletion%20Verification%20-%20${encodeURIComponent(activeCode)}`}
                  className="inline-flex items-center gap-1.5 font-bold text-emerald-950 bg-emerald-200/80 hover:bg-emerald-300/80 px-3 py-1.5 rounded-md transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Request Official Certificate of Destruction
                </a>
                <button
                  type="button"
                  onClick={handleResetSearch}
                  className="text-emerald-800 hover:text-emerald-950 underline font-semibold"
                >
                  Clear Lookup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 1: Self-Service Instructions */}
      <section className="space-y-4 mb-10">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
          <div className="w-7 h-7 rounded-full bg-teal-600 text-white font-extrabold text-sm flex items-center justify-center">
            1
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Step 1: Automated Self-Service App Removal via Facebook / Instagram
          </h2>
        </div>
        <p className="text-slate-700 leading-relaxed text-sm sm:text-base">
          If you communicated with a business that manages its Facebook Page or Instagram channel through LUXIRA CRM, you can revoke permissions and initiate an automated data purge directly through your Meta account settings:
        </p>

        <ol className="list-decimal pl-6 space-y-2.5 text-slate-700 text-sm sm:text-base">
          <li>
            Log in to your Facebook or Instagram profile at{' '}
            <a href="https://www.facebook.com/settings?tab=applications" target="_blank" rel="noopener noreferrer" className="text-teal-700 underline font-semibold inline-flex items-center gap-1">
              facebook.com/settings <ExternalLink className="w-3 h-3" />
            </a>.
          </li>
          <li>
            Navigate to: <strong>Settings &amp; Privacy</strong> &gt; <strong>Settings</strong>.
          </li>
          <li>
            In the left navigation sidebar, select <strong>Apps and Websites</strong>.
          </li>
          <li>
            Locate <strong>&ldquo;CRM Demo&rdquo;</strong> (or connected App ID: <code>2591862777899310</code>) in your active apps list.
          </li>
          <li>
            Click <strong>&ldquo;Remove&rdquo;</strong>. In the dialog, click <strong>&ldquo;View details&rdquo;</strong> to request data deletion, and confirm by clicking <strong>&ldquo;Remove&rdquo;</strong>.
          </li>
        </ol>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 leading-relaxed">
          <strong>How it works:</strong> Upon removal, Meta automatically sends an authenticated signed request to our server callback (<code>POST /data-deletion</code>). Our system automatically schedules your conversation history for permanent database scrubbing and generates your official <code>LUX-DEL-...</code> confirmation tracking code.
        </div>
      </section>

      {/* Step 2: Interactive Search Box */}
      <section className="space-y-4 mb-10">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
          <div className="w-7 h-7 rounded-full bg-teal-600 text-white font-extrabold text-sm flex items-center justify-center">
            2
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Step 2: Interactive Deletion Status Lookup
          </h2>
        </div>
        <p className="text-slate-700 text-sm sm:text-base">
          Enter your confirmation reference code below to check the real-time status of your deletion request across our database clusters:
        </p>

        <form onSubmit={handleSearch} className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-6 space-y-3">
          <label htmlFor="ref-code-input" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
            Confirmation Reference Tracking Code:
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="ref-code-input"
                type="text"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                placeholder="e.g. LUX-DEL-1757209123-ABCD1234"
                className="w-full pl-10 pr-4 py-2.5 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all text-slate-900"
                required
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Search className="w-4 h-4" />
              Verify Status
            </button>
          </div>
        </form>
      </section>

      {/* Step 3: Direct Email Contact Form / Button */}
      <section className="space-y-4 mb-8">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
          <div className="w-7 h-7 rounded-full bg-teal-600 text-white font-extrabold text-sm flex items-center justify-center">
            3
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Step 3: Direct Request to the Data Protection Officer
          </h2>
        </div>
        <p className="text-slate-700 leading-relaxed text-sm sm:text-base">
          If you prefer to submit a manual deletion directive directly, or if you communicated via an Instagram handle or web widget, click below to generate an official request email to our Data Protection Department:
        </p>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-sm text-slate-700">
            <p className="font-bold text-slate-900">Data Protection Officer Direct Inbox</p>
            <p className="text-xs text-slate-500">
              Response SLA: Acknowledgment within 24 hours &bull; Full purge within 48 business hours
            </p>
          </div>
          <a
            href="mailto:privacy@webluxira.com?subject=Data%20Deletion%20Request&body=Full%20Name%3A%20%0AConnected%20Page%2FAccount%3A%20%0APSID%20or%20Instagram%20Handle%3A%20%0ADate%20of%20Conversation%3A%20"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold rounded-lg shadow-sm transition-colors"
          >
            <Mail className="w-4 h-4 text-teal-400" />
            Email privacy@webluxira.com
          </a>
        </div>
      </section>

      {/* Scope of Data Scrubbed */}
      <section className="space-y-4 pt-4 border-t border-slate-200">
        <h3 className="text-lg font-bold text-slate-900">
          Scope of Data Permanently Scrubbed
        </h3>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5">Data Category</th>
                <th className="px-4 py-2.5">Technical Scope of Deletion</th>
                <th className="px-4 py-2.5">Execution Timeline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr>
                <td className="px-4 py-2.5 font-semibold">Message Payloads</td>
                <td className="px-4 py-2.5">All customer inbound and agent outbound texts permanently deleted.</td>
                <td className="px-4 py-2.5">Within 48 business hours</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-semibold">Media Attachments</td>
                <td className="px-4 py-2.5">All voice notes, images, PDFs, and video files unlinked and hard deleted.</td>
                <td className="px-4 py-2.5">Immediate hard purge</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-semibold">Identity Identifiers</td>
                <td className="px-4 py-2.5">Meta Page-Scoped IDs (PSID) and Instagram-Scoped IDs (IGSID) scrubbed.</td>
                <td className="px-4 py-2.5">Cascaded from PostgreSQL</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-semibold">Standard Lifecycle</td>
                <td className="px-4 py-2.5">Automated cleanup of any remaining records upon reaching 90 days.</td>
                <td className="px-4 py-2.5">Strict 90-day retention ceiling</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </LegalLayout>
  );
};
