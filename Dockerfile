FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY python/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY python ./python

EXPOSE 8080

CMD ["uvicorn", "python.ai_server:app", "--host", "0.0.0.0", "--port", "8080"]
