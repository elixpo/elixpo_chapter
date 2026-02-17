FROM python:3.12-bullseye

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir playwright && \
    playwright install chromium && \
    playwright install-deps

COPY . .

# Create entrypoint script
RUN mkdir -p /app/docker_setup
COPY docker_setup/entrypoint.sh /app/docker_setup/entrypoint.sh
RUN chmod +x /app/docker_setup/entrypoint.sh

EXPOSE 8000
ENV PYTHONUNBUFFERED=1
ENTRYPOINT ["/app/docker_setup/entrypoint.sh"]