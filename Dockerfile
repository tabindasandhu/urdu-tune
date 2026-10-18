# ---- 1. Build the React app into plain HTML/JS/CSS ----
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 2. Python server that serves the API and the built site ----
FROM python:3.12-slim
# Run as a normal user, not root
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/home/user/app/data \
    STATIC_DIR=/home/user/app/static
WORKDIR /home/user/app

COPY --chown=user backend/requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt
COPY --chown=user backend/app ./app
COPY --chown=user --from=web /web/dist ./static

# Render tells the app which port to use through $PORT
EXPOSE 7860
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860}"]
