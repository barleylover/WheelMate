FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1
ENV PYTHONUTF8=1
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV DATA_DIR=/app/data
ENV MAX_NEW_GEOCODES=0

WORKDIR /app

COPY previsit_checklist.py /app/previsit_checklist.py
COPY mcp_server.py /app/mcp_server.py
COPY data/ /app/data/
COPY README_MVP.md /app/README_MVP.md
COPY USAGE_EXAMPLES.md /app/USAGE_EXAMPLES.md

RUN useradd --create-home --shell /usr/sbin/nologin appuser \
    && chown -R appuser:appuser /app

USER appuser

CMD ["python", "/app/mcp_server.py"]
