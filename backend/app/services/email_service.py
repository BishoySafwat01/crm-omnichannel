import os
import logging
import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger("EmailService")

class EmailService:
    @staticmethod
    def _send_smtp_sync(
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
    ) -> bool:
        """Synchronous SMTP email delivery using standard library smtplib."""
        smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com").strip()
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_user = os.getenv("SMTP_USER", "holdingluxira@gmail.com").strip()
        smtp_password = os.getenv("SMTP_PASSWORD", "ioipafauzwtpthwt").strip()
        smtp_from = os.getenv("SMTP_FROM", "holdingluxira@gmail.com").strip()
        from_name = os.getenv("SMTP_FROM_NAME", "Luxira CRM").strip()
        use_tls = os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")

        if not smtp_host or not smtp_user:
            logger.info(
                f"📧 [EmailService Simulation] SMTP not configured. Email to '{to_email}' logged:\n"
                f"Subject: {subject}\n"
                f"Preview: {(text_content or html_content)[:200]}..."
            )
            return True

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{from_name} <{smtp_from}>" if from_name else smtp_from
            msg["To"] = to_email

            if text_content:
                msg.attach(MIMEText(text_content, "plain", "utf-8"))
            msg.attach(MIMEText(html_content, "html", "utf-8"))

            server = smtplib.SMTP(smtp_host, smtp_port, timeout=12)
            if use_tls:
                server.starttls()
            if smtp_password:
                server.login(smtp_user, smtp_password)

            server.sendmail(smtp_from, [to_email], msg.as_string())
            server.quit()
            logger.info(f"✅ [EmailService] Alert email successfully sent to {to_email}")
            return True
        except Exception as e:
            logger.error(f"❌ [EmailService] Failed to send email to {to_email}: {e}")
            return False

    @classmethod
    async def send_email(
        cls,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
    ) -> bool:
        """Send email non-blockingly via asyncio worker thread."""
        return await asyncio.to_thread(
            cls._send_smtp_sync,
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
        )

    @classmethod
    async def send_message_deletion_alert(
        cls,
        admin_email: str,
        deleted_by_name: str,
        deleted_by_email: str,
        deleted_text: str,
        conversation_id: str,
        customer_name: str,
        brand_name: Optional[str] = None,
        channel: Optional[str] = None,
        deleted_at: Optional[datetime] = None,
    ) -> bool:
        """Send a dedicated, high-priority HTML email alert when a message is deleted."""
        now_str = (deleted_at or datetime.now(timezone.utc)).strftime("%Y-%m-%d %H:%M:%S UTC")
        clean_text = deleted_text.strip() if deleted_text else "(مرفق أو وسائط بدون نص)"
        subject = f"🚨 [تنبيه أمني] تم حذف رسالة في محادثة: {customer_name}"

        html_content = f"""<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="utf-8">
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 20px; }}
        .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }}
        .header {{ background: linear-gradient(135deg, #e11d48, #be123c); color: #ffffff; padding: 24px; text-align: center; }}
        .header h1 {{ margin: 0; font-size: 20px; font-weight: 800; }}
        .body {{ padding: 24px; }}
        .card {{ background: #fff1f2; border: 1px solid #fecdd3; border-radius: 12px; padding: 16px; margin-bottom: 20px; }}
        .card-title {{ color: #9f1239; font-weight: bold; font-size: 14px; margin-bottom: 8px; }}
        .deleted-box {{ background: #ffffff; border-right: 4px solid #e11d48; padding: 12px 16px; border-radius: 8px; font-size: 14px; color: #881337; font-weight: 600; line-height: 1.6; word-break: break-word; }}
        .info-table {{ width: 100%; border-collapse: collapse; margin-top: 16px; }}
        .info-table td {{ padding: 10px 8px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }}
        .info-label {{ font-weight: bold; color: #64748b; width: 35%; }}
        .info-value {{ color: #0f172a; font-weight: 600; }}
        .footer {{ background: #f8fafc; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚨 تنبيه أمني: تسجيل حذف رسالة</h1>
            <p style="margin: 6px 0 0 0; font-size: 12px; opacity: 0.9;">نظام LUXIRA Omnichannel CRM للمراقبة والتدقيق</p>
        </div>
        <div class="body">
            <div class="card">
                <div class="card-title">نص الرسالة المحذوفة:</div>
                <div class="deleted-box">{clean_text}</div>
            </div>

            <table class="info-table">
                <tr>
                    <td class="info-label">👤 قام بالحذف:</td>
                    <td class="info-value">{deleted_by_name} ({deleted_by_email})</td>
                </tr>
                <tr>
                    <td class="info-label">👤 العميل:</td>
                    <td class="info-value">{customer_name}</td>
                </tr>
                <tr>
                    <td class="info-label">🏢 المتجر / الماركة:</td>
                    <td class="info-value">{brand_name or "غير محدد"}</td>
                </tr>
                <tr>
                    <td class="info-label">📱 القناة:</td>
                    <td class="info-value">{channel or "الدردشة"}</td>
                </tr>
                <tr>
                    <td class="info-label">⏰ توقيت الحذف:</td>
                    <td class="info-value">{now_str}</td>
                </tr>
                <tr>
                    <td class="info-label">🆔 معرف المحادثة:</td>
                    <td class="info-value" style="font-family: monospace; font-size: 11px;">{conversation_id}</td>
                </tr>
            </table>
        </div>
        <div class="footer">
            تم إنشاء هذا البريد تلقائياً بواسطة نظام التدقيق الأمني لـ LUXIRA CRM.
        </div>
    </div>
</body>
</html>"""

        text_content = f"""[تنبيه أمني: تم حذف رسالة]
قام بالحذف: {deleted_by_name} ({deleted_by_email})
العميل: {customer_name}
المتجر: {brand_name or 'غير محدد'}
القناة: {channel or 'الدردشة'}
الوقت: {now_str}
الرسالة المحذوفة:
{clean_text}
معرف المحادثة: {conversation_id}
"""
        return await cls.send_email(
            to_email=admin_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
        )

    @classmethod
    async def send_bad_word_alert(
        cls,
        admin_email: str,
        sender_name: str,
        sender_role: str,
        matched_words: list[str],
        message_text: str,
        conversation_id: str,
        customer_name: str,
        brand_name: Optional[str] = None,
        channel: Optional[str] = None,
        detected_at: Optional[datetime] = None,
    ) -> bool:
        """Send high-priority email alert when bad/prohibited words are detected."""
        if not admin_email:
            return False

        now = detected_at or datetime.now(timezone.utc)
        now_str = now.strftime("%Y-%m-%d %H:%M:%S UTC")
        words_str = "، ".join(matched_words)

        subject = f"⚠️ [إنذار فوري] رصد كلمة محظورة ({words_str}) في محادثة {customer_name}"

        html_content = f"""<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="utf-8">
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a; direction: rtl; }}
        .card {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #fecdd3; overflow: hidden; box-shadow: 0 4px 12px rgba(225, 29, 72, 0.08); }}
        .header {{ background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%); color: #ffffff; padding: 20px 24px; }}
        .header h2 {{ margin: 0; font-size: 18px; font-weight: 800; }}
        .content {{ padding: 24px; }}
        .alert-box {{ background: #fff1f2; border: 1px solid #fecdd3; border-radius: 12px; padding: 14px; margin-bottom: 20px; }}
        .words-badge {{ background: #e11d48; color: #ffffff; padding: 4px 10px; border-radius: 8px; font-weight: 800; display: inline-block; }}
        .msg-box {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; font-family: monospace; font-size: 13px; color: #881337; margin-top: 8px; }}
        .info-table {{ width: 100%; border-collapse: collapse; margin-top: 16px; }}
        .info-table td {{ padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }}
        .info-label {{ font-weight: 700; color: #64748b; width: 35%; }}
        .info-value {{ font-weight: 600; color: #0f172a; }}
        .footer {{ background: #f8fafc; padding: 14px 24px; font-size: 11px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <h2>⚠️ إنذار أمني: رصد كلمات محظورة / غير لائقة</h2>
        </div>
        <div class="content">
            <div class="alert-box">
                <div style="font-size: 12px; font-weight: 700; color: #9f1239; margin-bottom: 6px;">الكلمات المرصودة:</div>
                <div class="words-badge">{words_str}</div>
                <div style="font-size: 12px; font-weight: 700; color: #475569; margin-top: 12px;">نص الرسالة الكامل:</div>
                <div class="msg-box">{message_text}</div>
            </div>
            <table class="info-table">
                <tr>
                    <td class="info-label">👤 مرسل الرسالة:</td>
                    <td class="info-value">{sender_name} ({sender_role})</td>
                </tr>
                <tr>
                    <td class="info-label">👤 العميل:</td>
                    <td class="info-value">{customer_name}</td>
                </tr>
                <tr>
                    <td class="info-label">🏢 المتجر:</td>
                    <td class="info-value">{brand_name or "غير محدد"}</td>
                </tr>
                <tr>
                    <td class="info-label">📱 القناة:</td>
                    <td class="info-value">{channel or "الدردشة"}</td>
                </tr>
                <tr>
                    <td class="info-label">⏰ توقيت الرصد:</td>
                    <td class="info-value">{now_str}</td>
                </tr>
                <tr>
                    <td class="info-label">🆔 معرف المحادثة:</td>
                    <td class="info-value" style="font-family: monospace; font-size: 11px;">{conversation_id}</td>
                </tr>
            </table>
        </div>
        <div class="footer">
            تم إنشاء هذا البريد تلقائياً بواسطة نظام التدقيق الأمني لـ LUXIRA CRM.
        </div>
    </div>
</body>
</html>"""

        text_content = f"""[إنذار أمني: رصد كلمات محظورة]
الكلمات: {words_str}
المرسل: {sender_name} ({sender_role})
الرسالة: {message_text}
العميل: {customer_name}
الوقت: {now_str}
المحادثة: {conversation_id}
"""
        return await cls.send_email(
            to_email=admin_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
        )
