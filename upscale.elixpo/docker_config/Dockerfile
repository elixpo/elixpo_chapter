
FROM python:3.10-slim
WORKDIR /app
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean
RUN mkdir -p /app/models
RUN wget -O /app/models/RealESRGAN_x2plus.pth \
    https://github.com/Circuit-Overtime/upscale.pollinations/releases/download/1.0.0/RealESRGAN_x2plus.pth && \
    wget -O /app/models/RealESRGAN_x4plus.pth \
    https://github.com/Circuit-Overtime/upscale.pollinations/releases/download/1.0.0/RealESRGAN_x4plus.pth
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt && \
    pip cache purge
COPY api/ ./api/
COPY start_servers.sh ./
COPY config.py ./
RUN mkdir -p /app/uploads && \
    chmod +x start_servers.sh


EXPOSE 8000

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV MODEL_DIR=/app/models
ENV UPLOAD_FOLDER=/app/uploads

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["./start_servers.sh"]