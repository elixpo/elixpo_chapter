from inviteBody import prepareBody 
import os
import json
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
from email_list import emails

load_dotenv()

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_USER = os.getenv("MAIL_USER")  
SMTP_PASSWORD = os.getenv("MAIL_PASS")  
FROM_EMAIL = SMTP_USER
SUBJECT = "⚠️ [GDG JISU] Warning & Followup Instructions for being Inactive at Google Study Jams"
for email in emails:
    to_email = email
    print(f"Preparing email for <{to_email}>")
    content = prepareBody()
    msg = EmailMessage()
    msg["Subject"] = SUBJECT
    msg['From'] = formataddr(("Ayushman Bhattacharya", "bhattacharyaa599@gmail.com"))
    msg["To"] = to_email
    msg.set_content(f"{content}", subtype="html")
    with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)
    print(f"✅ Email sent to <{to_email}>")
        
