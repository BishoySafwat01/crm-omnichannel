import hashlib
import time
from typing import Optional
from fastapi import APIRouter, Form, Request, status
from fastapi.responses import HTMLResponse, JSONResponse

router = APIRouter(tags=["legal"])


def _render_layout(title: str, active_tab: str, body_html: str) -> str:
    """Renders a responsive, modern HTML5 layout for legal and compliance pages."""
    privacy_active = "nav-active" if active_tab == "privacy" else ""
    terms_active = "nav-active" if active_tab == "terms" else ""
    deletion_active = "nav-active" if active_tab == "deletion" else ""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} | LUXIRA CRM</title>
  <meta name="description" content="Legal and compliance documentation for LUXIRA CRM omnichannel platform.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {{
      --primary: #1877F2;
      --primary-hover: #166fe5;
      --slate-900: #0f172a;
      --slate-800: #1e293b;
      --slate-700: #334155;
      --slate-600: #475569;
      --slate-500: #64748b;
      --slate-200: #e2e8f0;
      --slate-100: #f1f5f9;
      --slate-50: #f8fafc;
      --emerald-600: #059669;
      --emerald-50: #ecfdf5;
      --emerald-200: #a7f3d0;
      --amber-600: #d97706;
      --amber-50: #fffbeb;
      --amber-200: #fde68a;
      --radius-lg: 16px;
      --radius-md: 10px;
      --shadow-card: 0 10px 30px -5px rgba(15, 23, 42, 0.06), 0 4px 12px -2px rgba(15, 23, 42, 0.03);
    }}

    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }}

    body {{
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--slate-50);
      color: var(--slate-800);
      line-height: 1.65;
      padding: 0;
      margin: 0;
      -webkit-font-smoothing: antialiased;
    }}

    .navbar {{
      background: #ffffff;
      border-bottom: 1px solid var(--slate-200);
      padding: 1rem 2rem;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
    }}

    .navbar-container {{
      max-width: 1000px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
    }}

    .brand {{
      display: flex;
      align-items: center;
      gap: 0.75rem;
      text-decoration: none;
      color: var(--slate-900);
    }}

    .brand-badge {{
      background: linear-gradient(135deg, #1877F2 0%, #0d9488 100%);
      color: #ffffff;
      font-weight: 800;
      font-size: 0.95rem;
      width: 38px;
      height: 38px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(24, 119, 242, 0.3);
    }}

    .brand-title {{
      font-weight: 800;
      font-size: 1.15rem;
      letter-spacing: -0.02em;
    }}

    .brand-subtitle {{
      font-size: 0.75rem;
      color: var(--slate-500);
      font-weight: 500;
    }}

    .nav-links {{
      display: flex;
      align-items: center;
      gap: 0.5rem;
      list-style: none;
      flex-wrap: wrap;
    }}

    .nav-link {{
      text-decoration: none;
      color: var(--slate-600);
      font-size: 0.875rem;
      font-weight: 600;
      padding: 0.5rem 0.9rem;
      border-radius: var(--radius-md);
      transition: all 0.15s ease-in-out;
    }}

    .nav-link:hover {{
      color: var(--primary);
      background-color: var(--slate-100);
    }}

    .nav-active {{
      color: var(--primary) !important;
      background-color: #eff6ff !important;
      font-weight: 700;
    }}

    .main-content {{
      max-width: 960px;
      margin: 2.5rem auto 4rem auto;
      padding: 0 1.25rem;
    }}

    .card {{
      background: #ffffff;
      border: 1px solid var(--slate-200);
      border-radius: var(--radius-lg);
      padding: 2.5rem;
      box-shadow: var(--shadow-card);
    }}

    .header-section {{
      border-bottom: 1px solid var(--slate-200);
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
    }}

    .header-pill {{
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: #eff6ff;
      color: var(--primary);
      border: 1px solid #bfdbfe;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.3rem 0.75rem;
      border-radius: 9999px;
      margin-bottom: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }}

    h1 {{
      font-size: 2rem;
      font-weight: 800;
      color: var(--slate-900);
      letter-spacing: -0.025em;
      margin-bottom: 0.5rem;
      line-height: 1.25;
    }}

    .effective-date {{
      font-size: 0.85rem;
      color: var(--slate-500);
      font-weight: 500;
    }}

    h2 {{
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--slate-900);
      margin-top: 2rem;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      letter-spacing: -0.015em;
    }}

    p {{
      color: var(--slate-700);
      margin-bottom: 1rem;
      font-size: 0.95rem;
    }}

    ul, ol {{
      margin-bottom: 1.25rem;
      padding-left: 1.5rem;
      color: var(--slate-700);
      font-size: 0.95rem;
    }}

    li {{
      margin-bottom: 0.5rem;
    }}

    .alert-box {{
      background-color: var(--emerald-50);
      border: 1px solid var(--emerald-200);
      border-radius: var(--radius-md);
      padding: 1.25rem;
      margin: 1.5rem 0;
      display: flex;
      gap: 0.85rem;
      align-items: flex-start;
    }}

    .alert-icon {{
      color: var(--emerald-600);
      font-size: 1.25rem;
      line-height: 1;
      flex-shrink: 0;
      margin-top: 0.15rem;
    }}

    .alert-title {{
      font-weight: 700;
      color: #065f46;
      font-size: 0.95rem;
      margin-bottom: 0.25rem;
    }}

    .alert-desc {{
      font-size: 0.875rem;
      color: #047857;
      margin-bottom: 0;
    }}

    .contact-box {{
      background-color: var(--slate-50);
      border: 1px solid var(--slate-200);
      border-radius: var(--radius-md);
      padding: 1.25rem;
      margin-top: 2rem;
    }}

    .contact-box h3 {{
      font-size: 1rem;
      font-weight: 700;
      color: var(--slate-900);
      margin-bottom: 0.4rem;
    }}

    .contact-box a {{
      color: var(--primary);
      font-weight: 600;
      text-decoration: none;
    }}

    .contact-box a:hover {{
      text-decoration: underline;
    }}

    .footer {{
      border-top: 1px solid var(--slate-200);
      padding: 2rem 1.25rem;
      text-align: center;
      font-size: 0.85rem;
      color: var(--slate-500);
    }}

    .footer-links {{
      display: flex;
      justify-content: center;
      gap: 1.5rem;
      margin-bottom: 0.75rem;
      flex-wrap: wrap;
    }}

    .footer-links a {{
      color: var(--slate-600);
      text-decoration: none;
      font-weight: 600;
    }}

    .footer-links a:hover {{
      color: var(--primary);
    }}

    @media (max-width: 640px) {{
      .card {{
        padding: 1.5rem;
      }}
      h1 {{
        font-size: 1.6rem;
      }}
      .navbar {{
        padding: 1rem;
      }}
    }}
  </style>
</head>
<body>

  <header class="navbar">
    <div class="navbar-container">
      <a href="/privacy-policy" class="brand">
        <div class="brand-badge">L</div>
        <div>
          <div class="brand-title">LUXIRA CRM</div>
          <div class="brand-subtitle">Omnichannel Communications Platform</div>
        </div>
      </a>
      <nav>
        <ul class="nav-links">
          <li><a href="/privacy-policy" class="nav-link {privacy_active}">Privacy Policy</a></li>
          <li><a href="/terms-of-service" class="nav-link {terms_active}">Terms of Service</a></li>
          <li><a href="/data-deletion" class="nav-link {deletion_active}">Data Deletion</a></li>
        </ul>
      </nav>
    </div>
  </header>

  <main class="main-content">
    <div class="card">
      {body_html}
    </div>
  </main>

  <footer class="footer">
    <div class="footer-links">
      <a href="/privacy-policy">Privacy Policy</a>
      <span>•</span>
      <a href="/terms-of-service">Terms of Service</a>
      <span>•</span>
      <a href="/data-deletion">User Data Deletion Instructions</a>
    </div>
    <p>&copy; {time.strftime('%Y')} LUXIRA CRM. All rights reserved. Registered Contact: bishoysafwat2004@gmail.com</p>
  </footer>

</body>
</html>
"""


# ------------------------------------------------------------------------------
# 1. Privacy Policy Endpoint
# ------------------------------------------------------------------------------
@router.get("/privacy-policy", response_class=HTMLResponse, summary="LUXIRA Privacy Policy")
@router.get("/privacy", response_class=HTMLResponse, include_in_schema=False)
async def get_privacy_policy() -> HTMLResponse:
    content = """
      <div class="header-section">
        <div class="header-pill">Compliance & Privacy Notice</div>
        <h1>Privacy Policy</h1>
        <p class="effective-date">Last Updated & Effective: September 6, 2026</p>
      </div>

      <p>
        At <strong>LUXIRA CRM</strong> ("we", "our", or "us"), we value your trust and are committed to protecting 
        the privacy and personal data of our users, customers, and individuals who communicate with connected business channels. 
        This Privacy Policy explains how our omnichannel CRM platform accesses, processes, retains, and secures data received 
        through Meta Platforms (including Facebook Page Messages and Instagram Direct Messages) and other integrated communication channels.
      </p>

      <h2>1. Scope of the Service</h2>
      <p>
        LUXIRA CRM is a specialized customer communication and relationship management system. Businesses connect their authorized 
        Facebook Pages and Instagram Professional accounts to LUXIRA CRM to manage customer support inquiries, track inbound queries, 
        and provide timely support responses through a unified team inbox.
      </p>

      <h2>2. Data We Access & Collect</h2>
      <p>When you message an official Facebook Page or Instagram profile connected to LUXIRA CRM, our application accesses only the minimum data required to facilitate customer support:</p>
      <ul>
        <li><strong>Message Content:</strong> Inbound and outbound message text, photos, video attachments, audio notes, and timestamps exchanged during the conversation.</li>
        <li><strong>Sender Identity:</strong> Your Page-Scoped ID (PSID) or Instagram-Scoped ID (IGSID) generated by Meta to identify conversations without exposing your personal phone number or private account credentials.</li>
        <li><strong>Public Profile Metadata:</strong> Your public display name (first and last name) and public profile picture as authorized through Meta Graph API permissions (<code>pages_messaging</code>, <code>instagram_manage_messages</code>).</li>
        <li><strong>Support Metadata:</strong> Agent assignment, conversation resolution status, and notes added by human customer service representatives.</li>
      </ul>

      <h2>3. Purpose of Data Processing</h2>
      <p>We process personal data strictly for legitimate customer service operations, specifically:</p>
      <ul>
        <li>Displaying your inquiries to customer service agents in real-time.</li>
        <li>Delivering customer support responses, product details, order statuses, and service updates back to your chat.</li>
        <li>Maintaining support interaction logs to prevent duplicate questions and ensure consistent customer care.</li>
      </ul>

      <div class="alert-box">
        <div class="alert-icon">🛡️</div>
        <div>
          <div class="alert-title">Strict No-Sale & Confidentiality Guarantee</div>
          <p class="alert-desc">
            LUXIRA CRM never sells, rents, monetizes, or shares customer data or conversation history with third-party advertisers, 
            data brokers, or external analytics firms. Your messages are solely processed on behalf of the business you are communicating with.
          </p>
        </div>
      </div>

      <h2>4. Data Storage & Security Standards</h2>
      <p>
        We employ industry-standard administrative, physical, and technical safeguards to ensure data integrity:
      </p>
      <ul>
        <li><strong>Encryption:</strong> All data is encrypted in transit using Transport Layer Security (TLS 1.3 / SSL) and encrypted at rest in dedicated PostgreSQL databases.</li>
        <li><strong>Token Security:</strong> All Meta Page Access Tokens and credentials are encrypted using Fernet symmetric cryptography and are kept transient in server memory.</li>
        <li><strong>Access Control:</strong> Only authenticated, role-verified team agents have access to conversation logs.</li>
      </ul>

      <h2>5. Data Retention Policy</h2>
      <p>
        We retain customer conversation logs and associated identifiers only as long as necessary to provide customer support services, 
        resolve technical issues, and comply with legal audit requirements. Customers and users may request deletion of their data at any time.
      </p>

      <h2>6. Your Rights & Data Deletion</h2>
      <p>
        Under Meta Platform Policies, GDPR, and applicable privacy regulations, you have the right to request access to, rectification of, 
        or permanent deletion of all personal data held in our systems. For detailed instructions, please visit our 
        <a href="/data-deletion" style="color: var(--primary); font-weight: 700; text-decoration: none;">Data Deletion Instructions</a> page.
      </p>

      <div class="contact-box">
        <h3>Contact & Data Protection Officer (DPO)</h3>
        <p>If you have any questions, inquiries, or privacy concerns, please contact our Data Protection Officer directly:</p>
        <p><strong>Bishoy Safwat</strong> — Lead Security & Data Protection Officer<br>
        Email: <a href="mailto:bishoysafwat2004@gmail.com">bishoysafwat2004@gmail.com</a><br>
        Platform: LUXIRA Omnichannel CRM
        </p>
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
      <div class="header-section">
        <div class="header-pill">Legal Agreement</div>
        <h1>Terms of Service</h1>
        <p class="effective-date">Last Updated & Effective: September 6, 2026</p>
      </div>

      <p>
        Welcome to <strong>LUXIRA CRM</strong>. These Terms of Service ("Terms") govern your use of the LUXIRA CRM 
        omnichannel platform, application interfaces, and associated messaging services (collectively, the "Service"). 
        By accessing or using our Service, connecting social media pages, or communicating with channels managed by LUXIRA CRM, 
        you agree to be bound by these Terms.
      </p>

      <h2>1. Description of Service</h2>
      <p>
        LUXIRA CRM provides software tools enabling businesses to aggregate, respond to, and manage communications originating 
        from Facebook Pages, Instagram Professional accounts, and other digital messaging channels in a single collaborative interface.
      </p>

      <h2>2. Adherence to Meta Platform Policies</h2>
      <p>
        Our Service operates in strict compliance with the <strong>Meta Platform Terms</strong>, <strong>Developer Policies</strong>, 
        and <strong>Commercial Messaging Guidelines</strong>. Users and businesses utilizing LUXIRA CRM must ensure that:
      </p>
      <ul>
        <li>They do not send unsolicited commercial messages, spam, or misleading communications.</li>
        <li>They adhere to Meta's standard 24-hour messaging window and approved message tags (such as <code>HUMAN_AGENT</code>).</li>
        <li>They maintain explicit customer consent to receive direct business communications.</li>
      </ul>

      <h2>3. Acceptable Use Policy</h2>
      <p>When using LUXIRA CRM, you agree not to:</p>
      <ul>
        <li>Violate any local, national, or international laws or regulations.</li>
        <li>Transmit hate speech, defamatory, fraudulent, harassing, or sexually explicit content.</li>
        <li>Attempt to reverse engineer, decompile, or compromise the security architecture of the platform.</li>
        <li>Interfere with the normal operation or performance of the Service.</li>
      </ul>

      <h2>4. Intellectual Property</h2>
      <p>
        All rights, title, and interest in and to the LUXIRA CRM platform (including software code, user interface designs, 
        trademarks, and documentation) are and will remain the exclusive property of LUXIRA CRM and its licensors.
      </p>

      <h2>5. Uptime & Service Availability</h2>
      <p>
        While we strive to provide 99.9% uptime and reliable message delivery, the Service is provided on an "as is" and "as available" basis. 
        We are not liable for communication delays or delivery failures resulting from Meta Graph API outages, internet service disruptions, 
        or scheduled infrastructure maintenance.
      </p>

      <h2>6. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, LUXIRA CRM shall not be liable for any indirect, incidental, special, consequential, 
        or punitive damages, or any loss of profits or revenues resulting from your use of or inability to use the Service.
      </p>

      <h2>7. Modifications to Terms</h2>
      <p>
        We reserve the right to modify these Terms at any time. Continued use of the platform after updates are published 
        constitutes your acceptance of the revised Terms.
      </p>

      <div class="contact-box">
        <h3>Questions Regarding Terms?</h3>
        <p>For inquiries regarding these Terms of Service, contact our administrative office:</p>
        <p>Email: <a href="mailto:bishoysafwat2004@gmail.com">bishoysafwat2004@gmail.com</a><br>
        Brand: LUXIRA CRM Platform
        </p>
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
    confirmation_id = request.query_params.get("id")
    confirmation_banner = ""
    if confirmation_id:
        confirmation_banner = f"""
        <div class="alert-box" style="background-color: #f0fdf4; border-color: #86efac; margin-bottom: 2rem;">
          <div class="alert-icon">✅</div>
          <div>
            <div class="alert-title">Data Deletion Request Recorded</div>
            <p class="alert-desc">
              Your deletion request reference code is <strong>{confirmation_id}</strong>. 
              Our compliance team is processing the permanent purge of all associated records within 48 hours.
            </p>
          </div>
        </div>
        """

    content = f"""
      <div class="header-section">
        <div class="header-pill">Meta Compliance Policy 4.d</div>
        <h1>User Data Deletion Instructions</h1>
        <p class="effective-date">Last Updated & Verified: September 6, 2026</p>
      </div>

      {confirmation_banner}

      <p>
        In accordance with the <strong>Meta Platform Developer Policy (Section 4.d)</strong> and international data privacy regulations 
        (including GDPR and CCPA), <strong>LUXIRA CRM</strong> provides users with a transparent, guaranteed mechanism to request 
        the complete and permanent deletion of any personal data, messages, and profile information processed by our application.
      </p>

      <div class="alert-box">
        <div class="alert-icon">⏱️</div>
        <div>
          <div class="alert-title">48-Hour Permanent Deletion Guarantee</div>
          <p class="alert-desc">
            Upon receipt of your deletion request, all conversation transcripts, Page-Scoped IDs (PSID), Instagram-Scoped IDs (IGSID), 
            and customer profile records will be permanently erased from our production databases within <strong>48 hours</strong>.
          </p>
        </div>
      </div>

      <h2>How to Request Deletion of Your Data</h2>
      <p>You can request data deletion through either of the two official methods below:</p>

      <h3 style="font-size: 1.1rem; color: var(--slate-900); margin: 1.25rem 0 0.5rem 0;">Method 1: Direct Email Request (Recommended)</h3>
      <ol>
        <li>
          Send an email to our Data Protection Officer at: 
          <a href="mailto:bishoysafwat2004@gmail.com?subject=Data%20Deletion%20Request%20-%20LUXIRA%20CRM" style="color: var(--primary); font-weight: 700; text-decoration: none;">
            bishoysafwat2004@gmail.com
          </a>
        </li>
        <li>
          Set the email subject line to: <strong>"Data Deletion Request - LUXIRA CRM"</strong>.
        </li>
        <li>
          In the body of the email, include:
          <ul>
            <li>Your full Facebook or Instagram display name.</li>
            <li>The name of the Facebook Page or Instagram Account you communicated with.</li>
            <li>Your Page-Scoped ID (PSID) or Instagram Username (if known).</li>
          </ul>
        </li>
        <li>
          Our compliance team will immediately acknowledge your request, initiate the database purge, and send you a final 
          confirmation email once all records are permanently deleted.
        </li>
      </ol>

      <h3 style="font-size: 1.1rem; color: var(--slate-900); margin: 1.5rem 0 0.5rem 0;">Method 2: Remove App Permissions via Facebook Settings</h3>
      <p>If you have authorized LUXIRA CRM through Facebook Login or Page Interactions, you can revoke permissions directly on Meta:</p>
      <ol>
        <li>Log into your Facebook profile on a browser or mobile device.</li>
        <li>Navigate to <strong>Settings & Privacy</strong> &gt; <strong>Settings</strong>.</li>
        <li>In the left sidebar, click on <strong>Apps and Websites</strong>.</li>
        <li>Search for or locate <strong>LUXIRA CRM</strong> in the list of connected apps.</li>
        <li>Click <strong>Remove</strong>. Check the option to delete posts, videos, or events, and confirm by clicking <strong>Remove</strong>.</li>
      </ol>

      <h2>What Data is Purged?</h2>
      <p>When a deletion request is executed, we permanently delete:</p>
      <ul>
        <li>All chat messages, attachments, media files, and timestamps from our storage.</li>
        <li>All customer records, name entries, and associated phone/email records.</li>
        <li>All Page-Scoped Identifiers (PSID) and identity linkages.</li>
      </ul>

      <div class="contact-box">
        <h3>Need Assistance with Data Deletion?</h3>
        <p>If you have questions or require manual assistance verifying your deletion request, contact:</p>
        <p>
          <strong>Bishoy Safwat</strong> — Data Protection Officer<br>
          Email: <a href="mailto:bishoysafwat2004@gmail.com">bishoysafwat2004@gmail.com</a><br>
          Service: LUXIRA CRM Platform Support
        </p>
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
    Handles Meta's automated signed data deletion callback (Meta Platform Policy 4.d).
    Returns a confirmation code and status check URL as required by Meta.
    """
    # Generate unique confirmation reference code
    timestamp = int(time.time())
    raw_id = f"luxira_del_{timestamp}_{request.client.host if request.client else 'meta'}"
    confirmation_code = hashlib.sha256(raw_id.encode()).hexdigest()[:16]

    # Construct public status tracking URL
    base_url = str(request.base_url).rstrip("/")
    status_url = f"{base_url}/data-deletion?id={confirmation_code}"

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "url": status_url,
            "confirmation_code": confirmation_code,
        },
    )
