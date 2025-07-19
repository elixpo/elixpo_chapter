FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip
RUN pip install -r requirements.txt
RUN pip install playwright && playwright install chromium &&  playwright install-deps
COPY . .

EXPOSE 5000
ENV FLASK_APP=src/app.py
CMD ["python3", "src/app.py"]
