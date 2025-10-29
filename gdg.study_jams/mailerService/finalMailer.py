from inviteBody import prepareBody 
import os
import json
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
from retrieve import getEmailList

load_dotenv()

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_USER = os.getenv("MAIL_USER")  
SMTP_PASSWORD = os.getenv("MAIL_PASS")  
FROM_EMAIL = SMTP_USER
SUBJECT = "⚠️ [GDG JISU] Warning & Followup Instructions for being Inactive at Google Study Jams"
testMode = False

if testMode:
        to_email = "ayushbhatt633@gmail.com"
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
else:
    all_emails = getEmailList()
    for email in all_emails:
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
print("All emails sent successfully!")
        
