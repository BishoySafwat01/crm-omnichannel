import html as py_html
import secrets
import time
from typing import Optional
from fastapi import APIRouter, Form, Request, status
from fastapi.responses import HTMLResponse, JSONResponse

router = APIRouter(tags=["legal"])

CSS_STYLES = """
    :root {
      --slate-900: #0f172a;
      --slate-800: #1e293b;
      --slate-700: #334155;
      --slate-600: #475569;
      --slate-500: #64748b;
      --slate-400: #94a3b8;
      --slate-300: #cbd5e1;
      --slate-200: #e2e8f0;
      --slate-100: #f1f5f9;
      --slate-50: #f8fafc;
      --brand-900: #1e3a8a;
      --brand-800: #1e40af;
      --brand-700: #1d4ed8;
      --brand-600: #2563eb;
      --brand-500: #3b82f6;
      --brand-50: #eff6ff;
      --brand-border: #bfdbfe;
      --emerald-800: #065f46;
      --emerald-700: #047857;
      --emerald-600: #059669;
      --emerald-100: #d1fae5;
      --emerald-50: #ecfdf5;
      --amber-800: #92400e;
      --amber-700: #b45309;
      --amber-100: #fef3c7;
      --amber-50: #fffbeb;
      --radius-lg: 12px;
      --radius-md: 8px;
      --radius-sm: 4px;
      --shadow-sm: 0 1px 2px 0 rgba(15, 23, 42, 0.05);
      --shadow-md: 0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05);
      --shadow-lg: 0 10px 25px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--slate-50);
      color: var(--slate-800);
      line-height: 1.7;
      font-size: 15px;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    .site-header {
      background-color: #ffffff;
      border-bottom: 1px solid var(--slate-200);
      position: sticky;
      top: 0;
      z-index: 50;
      box-shadow: var(--shadow-sm);
    }

    .header-inner {
      max-width: 1040px;
      margin: 0 auto;
      padding: 0.875rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1.5rem;
    }

    .brand-group {
      display: flex;
      align-items: center;
      gap: 0.875rem;
      text-decoration: none;
      color: inherit;
    }

    .brand-mark {
      width: 38px;
      height: 38px;
      background: linear-gradient(135deg, var(--brand-800) 0%, var(--brand-600) 100%);
      color: #ffffff;
      font-weight: 800;
      font-size: 1.05rem;
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      letter-spacing: -0.02em;
    }

    .brand-meta {
      display: flex;
      flex-direction: column;
    }

    .brand-name {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--slate-900);
      letter-spacing: -0.02em;
      line-height: 1.2;
    }

    .brand-sub {
      font-size: 0.75rem;
      color: var(--slate-500);
      font-weight: 500;
      letter-spacing: -0.01em;
    }

    .site-nav {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      list-style: none;
    }

    .nav-item a {
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--slate-600);
      padding: 0.45rem 0.85rem;
      border-radius: var(--radius-md);
      transition: all 0.15s ease-in-out;
    }

    .nav-item a:hover {
      color: var(--brand-700);
      background-color: var(--slate-100);
    }

    .nav-item a.active {
      color: var(--brand-800);
      background-color: var(--brand-50);
      border: 1px solid var(--brand-border);
    }

    .main-wrap {
      max-width: 980px;
      margin: 2.5rem auto 4.5rem auto;
      padding: 0 1.25rem;
    }

    .document-card {
      background: #ffffff;
      border: 1px solid var(--slate-200);
      border-radius: var(--radius-lg);
      padding: 3.25rem 3.5rem;
      box-shadow: var(--shadow-lg);
    }

    .doc-meta-bar {
      padding-bottom: 1.75rem;
      margin-bottom: 2.25rem;
      border-bottom: 1px solid var(--slate-200);
    }

    .doc-badge {
      display: inline-block;
      font-size: 0.725rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--brand-800);
      background-color: var(--brand-50);
      border: 1px solid var(--brand-border);
      padding: 0.25rem 0.65rem;
      border-radius: var(--radius-sm);
      margin-bottom: 0.875rem;
    }

    h1 {
      font-size: 2.15rem;
      font-weight: 800;
      color: var(--slate-900);
      letter-spacing: -0.03em;
      line-height: 1.25;
      margin-bottom: 0.5rem;
    }

    .doc-attributes {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem 2rem;
      margin-top: 0.875rem;
      font-size: 0.825rem;
      color: var(--slate-500);
    }

    .doc-attr-item strong {
      color: var(--slate-700);
    }

    h2 {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--slate-900);
      letter-spacing: -0.02em;
      margin-top: 2.25rem;
      margin-bottom: 0.875rem;
      padding-bottom: 0.35rem;
      border-bottom: 1px solid var(--slate-100);
    }

    h3 {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--slate-800);
      margin-top: 1.5rem;
      margin-bottom: 0.5rem;
    }

    p {
      margin-bottom: 1.15rem;
      color: var(--slate-700);
      font-size: 0.95rem;
    }

    ul, ol {
      margin-bottom: 1.25rem;
      padding-left: 1.65rem;
      color: var(--slate-700);
    }

    li {
      margin-bottom: 0.55rem;
      font-size: 0.95rem;
    }

    strong {
      color: var(--slate-900);
    }

    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.85em;
      background-color: var(--slate-100);
      border: 1px solid var(--slate-200);
      padding: 0.15rem 0.35rem;
      border-radius: 4px;
      color: var(--slate-800);
    }

    .callout-notice {
      background-color: var(--slate-50);
      border: 1px solid var(--slate-200);
      border-left: 4px solid var(--brand-700);
      border-radius: var(--radius-md);
      padding: 1.25rem 1.5rem;
      margin: 1.75rem 0;
    }

    .callout-notice.callout-success {
      background-color: var(--emerald-50);
      border-color: var(--emerald-100);
      border-left-color: var(--emerald-700);
    }

    .callout-notice.callout-warning {
      background-color: var(--amber-50);
      border-color: var(--amber-100);
      border-left-color: var(--amber-700);
    }

    .callout-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--slate-900);
      margin-bottom: 0.35rem;
    }

    .callout-success .callout-title {
      color: var(--emerald-800);
    }

    .callout-warning .callout-title {
      color: var(--amber-800);
    }

    .callout-desc {
      font-size: 0.9rem;
      color: var(--slate-700);
      margin-bottom: 0;
    }

    .callout-success .callout-desc {
      color: var(--emerald-800);
    }

    .legal-table-wrap {
      overflow-x: auto;
      margin: 1.5rem 0;
      border: 1px solid var(--slate-200);
      border-radius: var(--radius-md);
    }

    table.legal-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      text-align: left;
    }

    table.legal-table th {
      background-color: var(--slate-100);
      color: var(--slate-800);
      font-weight: 700;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--slate-200);
      white-space: nowrap;
    }

    table.legal-table td {
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--slate-100);
      color: var(--slate-700);
      vertical-align: top;
    }

    table.legal-table tr:last-child td {
      border-bottom: none;
    }

    table.legal-table tr:hover td {
      background-color: var(--slate-50);
    }

    .status-lookup-card {
      background-color: var(--slate-50);
      border: 1px solid var(--slate-200);
      border-radius: var(--radius-md);
      padding: 1.5rem;
      margin: 2rem 0;
    }

    .status-lookup-form {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 0.75rem;
    }

    .status-lookup-form label {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--slate-800);
    }

    .status-input-row {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .status-input-row input {
      flex: 1;
      min-width: 260px;
      padding: 0.65rem 0.9rem;
      font-size: 0.9rem;
      border: 1px solid var(--slate-300);
      border-radius: var(--radius-md);
      color: var(--slate-900);
      background-color: #ffffff;
      outline: none;
      font-family: inherit;
    }

    .status-input-row input:focus {
      border-color: var(--brand-600);
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
    }

    .status-input-row button {
      background-color: var(--brand-700);
      color: #ffffff;
      font-size: 0.875rem;
      font-weight: 700;
      padding: 0.65rem 1.35rem;
      border: none;
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: background-color 0.15s ease;
      font-family: inherit;
    }

    .status-input-row button:hover {
      background-color: var(--brand-800);
    }

    .contact-card {
      background-color: var(--slate-50);
      border: 1px solid var(--slate-200);
      border-radius: var(--radius-md);
      padding: 1.5rem;
      margin-top: 2.5rem;
    }

    .contact-card h3 {
      font-size: 1rem;
      font-weight: 700;
      color: var(--slate-900);
      margin-top: 0;
      margin-bottom: 0.65rem;
    }

    .contact-card p {
      font-size: 0.9rem;
      margin-bottom: 0.4rem;
    }

    .contact-card a {
      color: var(--brand-700);
      font-weight: 600;
      text-decoration: none;
    }

    .contact-card a:hover {
      text-decoration: underline;
    }

    .site-footer {
      border-top: 1px solid var(--slate-200);
      padding: 2.25rem 1.25rem;
      text-align: center;
      font-size: 0.825rem;
      color: var(--slate-500);
      background-color: #ffffff;
    }

    .footer-links {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1.5rem;
      margin-bottom: 0.75rem;
      flex-wrap: wrap;
    }

    .footer-links a {
      color: var(--slate-600);
      text-decoration: none;
      font-weight: 600;
      font-size: 0.825rem;
    }

    .footer-links a:hover {
      color: var(--brand-700);
    }

    .footer-sep {
      color: var(--slate-300);
    }

    .footer-corp-meta {
      margin-top: 0.5rem;
      font-size: 0.775rem;
      color: var(--slate-400);
    }

    @media (max-width: 768px) {
      .header-inner {
        flex-direction: column;
        align-items: flex-start;
      }
      .site-nav {
        width: 100%;
        overflow-x: auto;
        padding-top: 0.5rem;
      }
      .document-card {
        padding: 1.75rem 1.5rem;
      }
      h1 {
        font-size: 1.65rem;
      }
      .doc-attributes {
        gap: 0.75rem;
        flex-direction: column;
      }
    }

    @media print {
      .site-header, .site-footer, .site-nav, .status-lookup-card {
        display: none !important;
      }
      body {
        background: #ffffff !important;
        color: #000000 !important;
      }
      .document-card {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
      }
      h2 {
        break-after: avoid;
      }
      table, .callout-notice {
        break-inside: avoid;
      }
    }
"""


def _render_layout(title: str, active_tab: str, body_html: str) -> str:
    """Renders an authoritative, accessible HTML5 layout for corporate legal views."""
    privacy_cls = "active" if active_tab == "privacy" else ""
    terms_cls = "active" if active_tab == "terms" else ""
    deletion_cls = "active" if active_tab == "deletion" else ""
    year = time.strftime("%Y")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} - LUXIRA Omnichannel Platform | Luxira Holding LLC</title>
  <meta name="description" content="{title} for LUXIRA Omnichannel CRM platform operated by LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ (Luxira Holding LLC). Meta Platform Terms (v23.0), GDPR, and CCPA compliant.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>{CSS_STYLES}</style>
</head>
<body>

  <header class="site-header">
    <div class="header-inner">
      <a href="/privacy-policy" class="brand-group">
        <div class="brand-mark">L</div>
        <div class="brand-meta">
          <span class="brand-name">LUXIRA</span>
          <span class="brand-sub">LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ</span>
        </div>
      </a>
      <nav aria-label="Compliance Navigation">
        <ul class="site-nav">
          <li class="nav-item"><a href="/privacy-policy" class="{privacy_cls}">Privacy Policy</a></li>
          <li class="nav-item"><a href="/terms-of-service" class="{terms_cls}">Terms of Service</a></li>
          <li class="nav-item"><a href="/data-deletion" class="{deletion_cls}">Data Deletion</a></li>
        </ul>
      </nav>
    </div>
  </header>

  <main class="main-wrap">
    <article class="document-card">
      {body_html}
    </article>
  </main>

  <footer class="site-footer">
    <div class="footer-links">
      <a href="/privacy-policy">Privacy Policy</a>
      <span class="footer-sep" aria-hidden="true">&bull;</span>
      <a href="/terms-of-service">Terms of Service</a>
      <span class="footer-sep" aria-hidden="true">&bull;</span>
      <a href="/data-deletion">User Data Deletion Instructions</a>
    </div>
    <p>&copy; {year} LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ (operating as Luxira Holding LLC). All rights reserved.</p>
    <p class="footer-corp-meta">
      VKN: 6091375815 (Kocasinan Vergi Dairesi) &bull; Headquarters: Şirinevler Mah. Meriç Sk. No: 15 Bahçelievler / İstanbul, Turkey &bull; Hosted at https://webluxira.com
    </p>
  </footer>

</body>
</html>"""


# ------------------------------------------------------------------------------
# 1. Privacy Policy Endpoint
# ------------------------------------------------------------------------------
@router.get("/privacy-policy", response_class=HTMLResponse, summary="LUXIRA Privacy Policy")
@router.get("/privacy", response_class=HTMLResponse, include_in_schema=False)
async def get_privacy_policy() -> HTMLResponse:
    content = """
      <header class="doc-meta-bar">
        <span class="doc-badge">Official Corporate Disclosure</span>
        <h1>Privacy Policy</h1>
        <div class="doc-attributes">
          <div class="doc-attr-item"><strong>Operating Entity:</strong> LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ (Luxira Holding LLC)</div>
          <div class="doc-attr-item"><strong>Tax Identification:</strong> VKN 6091375815 (Kocasinan Vergi Dairesi, Istanbul)</div>
          <div class="doc-attr-item"><strong>Effective Date:</strong> September 7, 2026</div>
          <div class="doc-attr-item"><strong>API Standard:</strong> Meta Graph API v23.0 &bull; Platform Terms Sec. 4.a, 4.b, 4.d</div>
        </div>
      </header>

      <h2>1. Corporate Identity & Legal Disclosures</h2>
      <p>
        This Privacy Policy governs the access, collection, processing, storage, and automated lifecycle erasure of personal data by 
        <strong>LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ</strong> (operating as <strong>Luxira Holding LLC</strong>, hereinafter &ldquo;Company&rdquo;, 
        &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) in operation of the <strong>LUXIRA Omnichannel Communications Platform</strong> 
        (hosted at <a href="https://webluxira.com" target="_blank" rel="noopener noreferrer">https://webluxira.com</a>).
      </p>
      <div class="legal-table-wrap">
        <table class="legal-table">
          <thead>
            <tr>
              <th>Legal Attribute</th>
              <th>Verified Registry Disclosure</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Registered Corporate Name</strong></td>
              <td>LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ (trading as Luxira Holding LLC)</td>
            </tr>
            <tr>
              <td><strong>Tax Office &amp; Tax Identification (VKN)</strong></td>
              <td>VKN 6091375815 &mdash; Kocasinan Vergi Dairesi, Istanbul, Turkey</td>
            </tr>
            <tr>
              <td><strong>Headquarters &amp; Registered Office</strong></td>
              <td>Şirinevler Mah. Meriç Sk. No: 15 Bahçelievler / İstanbul, Turkey</td>
            </tr>
            <tr>
              <td><strong>Data Controller &amp; Privacy Officer Contact</strong></td>
              <td><a href="mailto:privacy@webluxira.com">privacy@webluxira.com</a> (Operational fallback: <a href="mailto:support@webluxira.com">support@webluxira.com</a>)</td>
            </tr>
            <tr>
              <td><strong>Enterprise Platform URL</strong></td>
              <td><a href="https://webluxira.com" target="_blank" rel="noopener noreferrer">https://webluxira.com</a></td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>2. Scope of Service & Meta Graph API v23.0 Integration</h2>
      <p>
        LUXIRA CRM provides software infrastructure enabling businesses to aggregate, triage, route, and respond to incoming 
        customer inquiries originating from <strong>Facebook Messenger</strong> and <strong>Instagram Direct</strong> via 
        official integration with the <strong>Meta Graph API v23.0</strong>.
      </p>
      <p>
        Our system acts exclusively as a <em>Data Processor</em> executing customer communications workflows for authorized business 
        clients. The client organization maintaining the connected Facebook Page or Instagram Professional Account acts as the independent 
        <em>Data Controller</em>.
      </p>

      <h2>3. Specific Meta Graph API Permissions & Functional Scope</h2>
      <p>
        LUXIRA CRM requests and utilizes solely the minimum operational permissions required to deliver customer support triage via 
        Meta Graph API v23.0:
      </p>

      <div class="legal-table-wrap">
        <table class="legal-table">
          <thead>
            <tr>
              <th>Meta Permission</th>
              <th>Technical Purpose</th>
              <th>Data Categories Processed</th>
              <th>Applicable Messaging Rule</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>pages_messaging</code></td>
              <td>Ingesting customer inquiries dispatched to connected Facebook Pages and transmitting agent replies in real time.</td>
              <td>Customer message text, media attachments (images, audio, video files), conversation thread IDs, message delivery timestamps.</td>
              <td>Meta 24-hour customer service window; <code>HUMAN_AGENT</code> tag for agent responses within 7 calendar days.</td>
            </tr>
            <tr>
              <td><code>pages_show_list</code></td>
              <td>Enabling authenticated corporate administrators to view and select the authorized Facebook Pages they manage during setup.</td>
              <td>Page ID, Page Name, administrative permission verification flags.</td>
              <td>Admin OAuth consent flow; only explicitly selected pages are connected.</td>
            </tr>
            <tr>
              <td><code>pages_read_engagement</code></td>
              <td>Ingesting webhook message delivery receipts, read state markers, and thread timestamps for conversational triage.</td>
              <td>Message delivery status, read status timestamps, interaction counts.</td>
              <td>Used exclusively for SLA assignment and conversational status synchronization; zero profiling.</td>
            </tr>
            <tr>
              <td><code>pages_manage_metadata</code></td>
              <td>Automating webhook subscription lifecycle (subscribing connected Pages to <code>messages</code> and <code>messaging_postbacks</code>).</td>
              <td>Webhook subscription endpoints, callback verify tokens, application configuration flags.</td>
              <td>Technical routing infrastructure; no customer personal information accessed.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>4. Data Ingestion & Purpose of Processing</h2>
      <p>
        When an end-user sends a communication to a business connected to LUXIRA CRM, our backend ingests only the following concrete data points:
      </p>
      <ul>
        <li><strong>Page-Scoped Identifiers:</strong> Meta Page-Scoped IDs (PSID) or Instagram-Scoped IDs (IGSID) generated cryptographically by Meta to identify conversations. Scoped IDs do not reveal personal telephone numbers, personal email addresses, personal Facebook profile URLs, or national identification numbers.</li>
        <li><strong>Sender Display Name:</strong> First and last name as provided in the Meta public profile payload.</li>
        <li><strong>Message Content:</strong> Inbound and outbound message text and conversation transcripts.</li>
        <li><strong>Media Attachments:</strong> Images, audio voice notes, video clips, or document attachments transmitted by the sender.</li>
        <li><strong>Delivery Timestamps:</strong> Exact ISO-8601 message timestamps and delivery status flags.</li>
      </ul>
      <p>
        <strong>Strict Operational Purpose:</strong> These data points are processed strictly and exclusively for routing, assigning, 
        and resolving customer service inquiries via the internal unified CRM team inbox.
      </p>

      <h2>5. Explicit Prohibitions & Zero-Sale Guarantee (Meta Terms Section 4.a)</h2>
      <p>
        In accordance with Section 4.a of the Meta Platform Terms:
      </p>
      <ul>
        <li><strong>Zero-Sale Guarantee:</strong> LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ does not sell, lease, rent, trade, monetize, or transfer customer conversation data or Meta platform data to third-party data brokers, advertising networks, or commercial syndicators under any circumstance.</li>
        <li><strong>No Commercial Profiling:</strong> We do not construct consumer behavioral profiles, psychological scores, credit evaluations, or audience segmentation models from customer communications.</li>
        <li><strong>Zero Cross-Context Behavioral Advertising:</strong> Message contents and customer identifiers are never utilized to serve or optimize targeted advertisements across third-party platforms.</li>
        <li><strong>No Machine Learning Model Harvesting:</strong> Customer communication transcripts are strictly isolated and are never ingested into foundation models or utilized for training external artificial intelligence systems.</li>
      </ul>

      <div class="callout-notice">
        <div class="callout-title">Operational Purpose Limitation</div>
        <p class="callout-desc">
          All platform data received via Meta Graph API v23.0 is accessed solely to facilitate real-time customer support 
          between the sender and the verified business Page. Data is never cross-referenced across separate tenant organizations.
        </p>
      </div>

      <h2>6. Strict 90-Day Retention & Automated Purging Policy</h2>
      <p>
        In compliance with data minimization principles and Meta Platform Policies:
      </p>
      <ul>
        <li><strong>90-Day Operational Lifecycle:</strong> Ingested chat logs, conversation transcripts, Page-Scoped IDs, and media attachments are retained in active storage for an operational lifecycle of <strong>exactly ninety (90) calendar days</strong> from the timestamp of the latest message in the thread.</li>
        <li><strong>Automated Hard Purge:</strong> Upon reaching the 90-day lifecycle limit, an automated scheduled database daemon permanently excises all conversation records, attachments, and customer identifiers from PostgreSQL databases and block storage volumes.</li>
        <li><strong>Early Deletion on Demand:</strong> If a user requests data erasure prior to the 90-day limit, all corresponding records are permanently purged within 48 business hours pursuant to Section 4.d of the Meta Platform Terms.</li>
      </ul>

      <h2>7. Technical Security Measures & Sub-Processors (Meta Terms Section 4.b)</h2>
      <p>
        We implement comprehensive organizational and technical security measures to ensure data confidentiality:
      </p>
      <ul>
        <li><strong>In-Transit Encryption:</strong> All communications between Meta Graph API webhooks, LUXIRA backend systems, and client web browsers are strictly encrypted using Transport Layer Security (TLS 1.3 / modern HTTPS).</li>
        <li><strong>At-Rest Encryption:</strong> Production databases and file storage instances are secured using AES-256 disk encryption. Access credentials and Meta Page Access Tokens are encrypted using symmetric cryptography (Fernet / AES-CBC) with isolated environment key distribution.</li>
        <li><strong>Role-Based Access Control (RBAC):</strong> Access to customer message threads is strictly restricted to authenticated, role-verified support personnel authorized by the subscriber organization.</li>
      </ul>

      <h3>Authorized Third-Party Sub-Processors</h3>
      <div class="legal-table-wrap">
        <table class="legal-table">
          <thead>
            <tr>
              <th>Sub-Processor</th>
              <th>Service Function</th>
              <th>Data Center Location</th>
              <th>Compliance Certifications</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Amazon Web Services, Inc. (AWS)</strong></td>
              <td>Encrypted cloud computing, managed PostgreSQL database hosting, secure block storage.</td>
              <td>Frankfurt (Germany) &amp; Ireland (EU Region)</td>
              <td>ISO 27001, SOC 1/2/3, PCI-DSS Level 1, GDPR DPA</td>
            </tr>
            <tr>
              <td><strong>Cloudflare, Inc.</strong></td>
              <td>Edge DDoS mitigation, Web Application Firewall (WAF), secure TLS 1.3 reverse proxy termination.</td>
              <td>Global Edge Network (EU Data Localization)</td>
              <td>ISO 27001, SOC 2 Type II, GDPR DPA</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>8. Data Subject Rights & Deletion Procedures (Meta Terms Section 4.d)</h2>
      <p>
        In accordance with Section 4.d of the Meta Platform Terms, GDPR Article 17, and CCPA, individuals have the absolute right 
        to request the permanent erasure of their personal data. For detailed instructions, visit our 
        <a href="/data-deletion" style="color: var(--brand-700); font-weight: 600; text-decoration: underline;">User Data Deletion Instructions</a> page.
      </p>

      <div class="contact-card">
        <h3>Data Controller &amp; Privacy Officer Contact</h3>
        <p>For inquiries, privacy audits, or formal data rights requests, contact our compliance office:</p>
        <p><strong>LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ &mdash; Privacy &amp; Legal Affairs</strong></p>
        <p>Headquarters: Şirinevler Mah. Meriç Sk. No: 15 Bahçelievler / İstanbul, Turkey</p>
        <p>Tax Identification: VKN 6091375815 (Kocasinan Vergi Dairesi)</p>
        <p>Primary Privacy Contact: <a href="mailto:privacy@webluxira.com">privacy@webluxira.com</a></p>
        <p>Operational Fallback: <a href="mailto:support@webluxira.com">support@webluxira.com</a></p>
      </div>
    """
    html = _render_layout(title="Privacy Policy", active_tab="privacy", body_html=content)
    return HTMLResponse(content=html, status_code=status.HTTP_200_OK)


# ------------------------------------------------------------------------------
# 2. Terms of Service Endpoint
# ------------------------------------------------------------------------------
@router.get("/terms-of-service", response_class=HTMLResponse, summary="LUXIRA Terms of Service")
@router.get("/terms", response_class=HTMLResponse, include_in_schema=False)
async def get_terms_of_service() -> HTMLResponse:
    content = """
      <header class="doc-meta-bar">
        <span class="doc-badge">Commercial B2B SaaS Agreement</span>
        <h1>Terms of Service</h1>
        <div class="doc-attributes">
          <div class="doc-attr-item"><strong>Issuing Entity:</strong> LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ (Luxira Holding LLC)</div>
          <div class="doc-attr-item"><strong>Tax Identification:</strong> VKN 6091375815 (Kocasinan Vergi Dairesi, Istanbul)</div>
          <div class="doc-attr-item"><strong>Effective Date:</strong> September 7, 2026</div>
          <div class="doc-attr-item"><strong>Standard:</strong> Commercial B2B SaaS &bull; Meta Developer Terms v23.0</div>
        </div>
      </header>

      <h2>1. Acceptance of Terms & Contracting Parties</h2>
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) constitute a legally binding agreement entered into between 
        <strong>LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ</strong> (operating as <strong>Luxira Holding LLC</strong>, 
        registered at Şirinevler Mah. Meriç Sk. No: 15 Bahçelievler / İstanbul, Turkey, Tax ID: VKN 6091375815, 
        hereinafter &ldquo;Company&rdquo;, &ldquo;we&rdquo;, or &ldquo;us&rdquo;) and the business entity or commercial enterprise 
        (&ldquo;Customer&rdquo;, &ldquo;Subscriber&rdquo;, or &ldquo;you&rdquo;) accessing or utilizing the 
        <strong>LUXIRA Omnichannel Communications Platform</strong> at 
        <a href="https://webluxira.com" target="_blank" rel="noopener noreferrer">https://webluxira.com</a> (the &ldquo;Service&rdquo;).
      </p>
      <p>
        By provisioning an account, linking social media channels, or accessing the Service, you warrant that you possess 
        full corporate authority to bind your organization to these Terms. If you do not agree with these Terms in their entirety, 
        you must not access or utilize the Service.
      </p>

      <h2>2. Description of Service & Operational Scope</h2>
      <p>
        LUXIRA CRM provides multi-channel customer communications software that enables enterprises to connect authorized commercial 
        communication channels—including Facebook Messenger and Instagram Direct via Meta Graph API v23.0—into a centralized team 
        inbox for inquiry routing, ticket assignment, and customer service delivery.
      </p>

      <h2>3. Strict Compliance with Meta Platform Terms & Commercial Rules</h2>
      <p>
        Subscribers connecting Facebook Pages or Instagram Business Accounts to LUXIRA CRM explicitly covenant and warrant that:
      </p>
      <ul>
        <li><strong>Adherence to Meta Terms:</strong> Customer shall comply at all times with the <em>Meta Platform Terms</em>, the <em>Meta Developer Policies</em>, and the <em>Meta Commercial Messaging Guidelines</em>.</li>
        <li><strong>24-Hour Messaging Window Compliance:</strong> Standard customer-care messaging through Meta Graph API is restricted to a 24-hour response window following user-initiated interaction. Responses dispatched after the 24-hour window must strictly utilize approved Meta message tags (such as <code>HUMAN_AGENT</code>) solely for human-driven responses to existing customer queries within 7 calendar days.</li>
        <li><strong>Absolute Prohibition Against Unsolicited Messaging:</strong> The Service shall never be used to dispatch unsolicited commercial messages, bulk advertising broadcasts, deceptive marketing campaigns, or spam to Meta platform users.</li>
        <li><strong>Consent &amp; Opt-In Safeguards:</strong> Customer is solely responsible for obtaining and verifying all legally mandated consents, disclosures, and opt-ins required under applicable consumer protection and telecommunications statutes (including TCPA, CAN-SPAM, and GDPR) prior to initiating communications.</li>
        <li><strong>Termination for Policy Abuse:</strong> Luxira Holding reserves the right to immediately suspend or terminate access to the Service for any Customer verified to have violated Meta messaging policies or terms of service.</li>
      </ul>

      <h2>4. Acceptable Use Policy (AUP)</h2>
      <p>When accessing or operating LUXIRA CRM, Customer and its authorized users agree not to:</p>
      <ul>
        <li>Transmit, distribute, or store any material that is defamatory, fraudulent, harassing, obscene, hateful, or in violation of intellectual property rights.</li>
        <li>Attempt to reverse engineer, decompile, disassemble, or derive source code from any portion of the platform or backend services.</li>
        <li>Probe, scan, or test the vulnerability of the system without prior explicit written authorization from Luxira Holding security engineers.</li>
        <li>Bypass, disable, or circumvent any rate limiting, authentication, or access control mechanisms implemented across the platform.</li>
        <li>Use automated scripts, bots, or unapproved scrapers to extract conversational data, metrics, or proprietary system layouts.</li>
      </ul>

      <h2>5. Intellectual Property Rights & Data Ownership</h2>
      <p>
        <strong>Platform Ownership:</strong> LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ retains all right, title, and interest in and to 
        the LUXIRA CRM software, user interfaces, database designs, proprietary algorithms, documentation, brand trademarks, and logos.
      </p>
      <p>
        <strong>Customer Data Ownership:</strong> As between the parties, Customer retains all proprietary rights, title, and interest 
        in and to conversational content, message history, customer profiles, and business media uploaded or routed through the Service. 
        Customer grants Company a non-exclusive, royalty-free, limited license to host, cache, and transmit Customer Data solely to the extent 
        necessary to deliver the contracted services.
      </p>

      <h2>6. 90-Day Retention Cycle & Lifecycle Cleanup</h2>
      <p>
        Customer explicitly acknowledges and agrees that customer chat transcripts, media attachments, and Page-Scoped IDs are retained 
        for an operational lifecycle of <strong>exactly 90 calendar days</strong>. Following the conclusion of this 90-day period, 
        all conversational data is automatically and irreversibly expunged from production databases. Customer is responsible for exporting 
        any records required for long-term compliance prior to lifecycle expiration.
      </p>

      <h2>7. Service Availability, SLA & Third-Party Dependencies</h2>
      <p>
        <strong>Uptime Commitment:</strong> Company targets an operational service uptime of 99.5% for the core CRM inbox, 
        excluding scheduled maintenance windows announced in advance.
      </p>
      <p>
        <strong>Third-Party Platform Disclaimer:</strong> Customer acknowledges that the Service relies upon external APIs and webhooks 
        operated by Meta Platforms, Inc. Company shall not be held liable for communication delays, undelivered messages, or temporary 
        service disruptions resulting directly from Meta Graph API downtimes, rate-limiting restrictions, platform policy changes, 
        or telecommunication outages outside Company&rsquo;s reasonable control.
      </p>

      <h2>8. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ, ITS DIRECTORS, 
        OFFICERS, EMPLOYEES, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES 
        (INCLUDING LOSS OF PROFITS, DATA LOSS, OR BUSINESS INTERRUPTION) ARISING OUT OF OR RELATED TO THE USE OF OR INABILITY TO USE THE SERVICE. 
        COMPANY&rsquo;S TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED THE TOTAL FEES ACTUALLY PAID BY CUSTOMER TO COMPANY DURING THE TWELVE (12) 
        MONTHS IMMEDIATELY PRECEDING THE CLAIM.
      </p>

      <h2>9. Governing Law & Dispute Resolution</h2>
      <p>
        These Terms shall be governed by and construed in accordance with the laws of the Republic of Turkey. Any dispute, controversy, 
        or claim arising out of or relating to these Terms shall be submitted to the exclusive jurisdiction of the competent Commercial 
        Courts and Execution Offices of Istanbul (Bakırköy / Çağlayan), Turkey.
      </p>

      <div class="contact-card">
        <h3>Corporate Legal Contacts</h3>
        <p>Formal legal notices, contract administration inquiries, or terms questions must be directed to:</p>
        <p><strong>LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ &mdash; Legal Affairs</strong></p>
        <p>Headquarters: Şirinevler Mah. Meriç Sk. No: 15 Bahçelievler / İstanbul, Turkey</p>
        <p>Tax Identification: VKN 6091375815 (Kocasinan Vergi Dairesi)</p>
        <p>Legal Inquiries: <a href="mailto:privacy@webluxira.com">privacy@webluxira.com</a></p>
        <p>Enterprise Support: <a href="mailto:support@webluxira.com">support@webluxira.com</a></p>
      </div>
    """
    html = _render_layout(title="Terms of Service", active_tab="terms", body_html=content)
    return HTMLResponse(content=html, status_code=status.HTTP_200_OK)


# ------------------------------------------------------------------------------
# 3. User Data Deletion Instructions Endpoint (GET & Meta Callback POST)
# ------------------------------------------------------------------------------
@router.get("/data-deletion", response_class=HTMLResponse, summary="User Data Deletion Instructions")
@router.get("/deletion", response_class=HTMLResponse, include_in_schema=False)
async def get_data_deletion_instructions(request: Request) -> HTMLResponse:
    confirmation_code = request.query_params.get("code") or request.query_params.get("id") or ""
    confirmation_code = py_html.escape(confirmation_code.strip())
    confirmation_banner = ""

    if confirmation_code:
        confirmation_banner = f"""
        <div class="callout-notice callout-success" style="margin-bottom: 2.25rem;">
          <div class="callout-title">Data Deletion Request Queued</div>
          <p class="callout-desc">
            Confirmation Reference Code: <strong>{confirmation_code}</strong><br>
            Current Status: <strong>QUEUED FOR PERMANENT PURGE</strong><br>
            Purge SLA: Complete permanent erasure of all associated conversation logs, Page-Scoped IDs (PSID), 
            and media attachments executed within <strong>48 business hours</strong> (well within our standard 90-day retention ceiling).
          </p>
          <p class="callout-desc" style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--emerald-800);">
            For immediate status verification or official destruction certificates, reference this code in an email to 
            <a href="mailto:privacy@webluxira.com?subject=Data%20Deletion%20Verification%20-%20{confirmation_code}" style="color: var(--emerald-800); font-weight: 700; text-decoration: underline;">privacy@webluxira.com</a>.
          </p>
        </div>
        """

    content = f"""
      <header class="doc-meta-bar">
        <span class="doc-badge">Meta Platform Compliance (Section 4.d)</span>
        <h1>User Data Deletion Instructions</h1>
        <div class="doc-attributes">
          <div class="doc-attr-item"><strong>Entity:</strong> LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ (Luxira Holding LLC)</div>
          <div class="doc-attr-item"><strong>Tax ID:</strong> VKN 6091375815 (Kocasinan Vergi Dairesi, Istanbul)</div>
          <div class="doc-attr-item"><strong>Regulatory Framework:</strong> Meta Policy 4.d / GDPR Article 17 / CCPA</div>
          <div class="doc-attr-item"><strong>Standard Purge SLA:</strong> 48 Business Hours (90-day maximum lifecycle)</div>
        </div>
      </header>

      {confirmation_banner}

      <h2>1. Purpose & Compliance Mandate</h2>
      <p>
        In accordance with <strong>Section 4.d of the Meta Platform Terms</strong>, <strong>Article 17 of the General Data Protection Regulation (GDPR)</strong> 
        (&ldquo;Right to Erasure&rdquo;), and the <strong>California Consumer Privacy Act (CCPA)</strong>, 
        <strong>LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ</strong> (operating as <strong>Luxira Holding LLC</strong>) 
        provides individuals and end-users with transparent, verified mechanisms to request the complete, permanent erasure 
        of all personal data, conversation transcripts, and platform identifiers processed through the 
        <strong>LUXIRA Omnichannel Communications Platform</strong>.
      </p>
      <p>
        Under our standard data lifecycle, all customer chat transcripts and attachments are automatically deleted within 
        <strong>90 calendar days</strong>. However, users maintain the right to initiate an immediate hard purge at any time 
        using the verified procedures below.
      </p>

      <h2>2. Step-by-Step Data Deletion Guide for Meta Users</h2>
      <p>Meta platform users can initiate data deletion through either of the two official channels:</p>

      <h3>Method 1: Direct App Removal via Facebook / Instagram Account Settings (Automated)</h3>
      <ol>
        <li>Log in to your Facebook or Instagram account on a web browser or mobile application.</li>
        <li>Navigate to: <strong>Settings &amp; Privacy</strong> &gt; <strong>Settings</strong>.</li>
        <li>In the left-hand navigation sidebar, select <strong>Apps and Websites</strong>.</li>
        <li>Locate <strong>&ldquo;CRM Demo&rdquo;</strong> (or our connected application ID: <code>2591862777899310</code>) in your active apps list.</li>
        <li>Click <strong>&ldquo;Remove&rdquo;</strong>. Select <strong>&ldquo;View details&rdquo;</strong> to request data deletion, and confirm by clicking <strong>&ldquo;Remove&rdquo;</strong>.</li>
      </ol>
      <p>
        Upon removal, Meta automatically dispatches an authenticated signed data deletion callback (<code>POST /data-deletion</code>) 
        to our servers. Our system instantly registers the request, creates a tracking code formatted as <code>LUX-DEL-[TIMESTAMP]-[RANDOM_HEX]</code>, 
        and permanently scrubs all corresponding conversation threads from production databases within 48 business hours.
      </p>

      <h3>Method 2: Direct Written Request to the Privacy Officer (Manual)</h3>
      <ol>
        <li>
          Send an email to our Data Protection Officer at: 
          <a href="mailto:privacy@webluxira.com?subject=Data%20Deletion%20Request" style="color: var(--brand-700); font-weight: 700; text-decoration: underline;">
            privacy@webluxira.com
          </a>
        </li>
        <li>Set the Subject Line to exactly: <strong>&ldquo;Data Deletion Request&rdquo;</strong></li>
        <li>In the body of your email, please specify:
          <ul>
            <li>Your full customer display name on Facebook or Instagram.</li>
            <li>The specific business Facebook Page or Instagram profile you communicated with.</li>
            <li>Your Page-Scoped ID (PSID), Instagram handle, or your conversation reference ID.</li>
          </ul>
        </li>
        <li>
          Our compliance team will issue an acknowledgment receipt within twenty-four (24) business hours containing your 
          <code>LUX-DEL-...</code> confirmation tracking code and finalize the permanent purge within 48 business hours.
        </li>
      </ol>

      <div class="status-lookup-card">
        <h3 style="margin-top: 0;">Interactive Deletion Status Lookup</h3>
        <p style="margin-bottom: 0.5rem; font-size: 0.9rem;">
          If you have already submitted a deletion request or removed the app via Facebook, enter your confirmation reference code below to verify your current purge status:
        </p>
        <form method="GET" action="/data-deletion" class="status-lookup-form">
          <label for="code-input">Confirmation Reference Code:</label>
          <div class="status-input-row">
            <input type="text" id="code-input" name="code" placeholder="e.g. LUX-DEL-1757209123-ABCD1234" value="{confirmation_code}" required />
            <button type="submit">Verify Deletion Status</button>
          </div>
        </form>
      </div>

      <h2>3. Scope of Data Permanently Scrubbed</h2>
      <p>Upon execution of a verified deletion directive, our automated purge pipeline permanently excises:</p>
      <div class="legal-table-wrap">
        <table class="legal-table">
          <thead>
            <tr>
              <th>Data Entity</th>
              <th>Technical Scope of Erasure</th>
              <th>Purge SLA</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Customer Conversation History</strong></td>
              <td>All inbound and outbound message texts, agent responses, and thread histories.</td>
              <td>Hard deletion within 48 business hours.</td>
            </tr>
            <tr>
              <td><strong>Media Assets &amp; Attachments</strong></td>
              <td>All uploaded photos, voice recordings, video clips, and document attachments stored in encrypted storage.</td>
              <td>Immediate storage unlinking &amp; hard purge.</td>
            </tr>
            <tr>
              <td><strong>Identity Identifiers</strong></td>
              <td>Meta Page-Scoped IDs (PSID), Instagram-Scoped IDs (IGSID), display names, and contact records.</td>
              <td>Foreign keys cascaded; tables scrubbed.</td>
            </tr>
            <tr>
              <td><strong>Audit &amp; Telemetry Logs</strong></td>
              <td>Transient webhook payload caches and session identifiers referencing the user.</td>
              <td>Overwritten and zeroed out during next rotation cycle.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="callout-notice">
        <div class="callout-title">Non-Retention Guarantee</div>
        <p class="callout-desc">
          LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ guarantees that zero shadow copies, unencrypted archives, or secondary profiling records are retained 
          following the completion of a verified data deletion request. All communications are subject to our strict 90-day ceiling and are 
          permanently purged upon request.
        </p>
      </div>

      <div class="contact-card">
        <h3>Compliance &amp; Data Rights Contacts</h3>
        <p><strong>LUXIRA KOZMETİK TİCARET LİMİTED ŞİRKETİ &mdash; Compliance Office</strong></p>
        <p>Headquarters: Şirinevler Mah. Meriç Sk. No: 15 Bahçelievler / İstanbul, Turkey</p>
        <p>Tax Identification: VKN 6091375815 (Kocasinan Vergi Dairesi)</p>
        <p>Data Deletion Inquiries: <a href="mailto:privacy@webluxira.com">privacy@webluxira.com</a></p>
        <p>Operational Fallback: <a href="mailto:support@webluxira.com">support@webluxira.com</a></p>
      </div>
    """
    html = _render_layout(title="User Data Deletion Instructions", active_tab="deletion", body_html=content)
    return HTMLResponse(content=html, status_code=status.HTTP_200_OK)


@router.post("/data-deletion", summary="Meta Data Deletion Callback Endpoint")
async def post_data_deletion_callback(
    request: Request,
    signed_request: Optional[str] = Form(None),
) -> JSONResponse:
    """
    Handles Meta's automated signed data deletion callback (Meta Platform Terms Section 4.d).
    Generates an authoritative confirmation code following the standard format
    LUX-DEL-[TIMESTAMP]-[RANDOM_HEX] and returns a canonical tracking URL.
    """
    timestamp = int(time.time())
    random_hex = secrets.token_hex(4).upper()
    confirmation_code = f"LUX-DEL-{timestamp}-{random_hex}"

    # Construct the canonical public tracking URL
    host = request.headers.get("host", "")
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)

    if "webluxira.com" in host:
        base_url = "https://webluxira.com"
    elif host:
        base_url = f"{proto}://{host}".rstrip("/")
    else:
        base_url = "https://webluxira.com"

    status_url = f"{base_url}/data-deletion?code={confirmation_code}"

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "url": status_url,
            "confirmation_code": confirmation_code,
        },
    )
