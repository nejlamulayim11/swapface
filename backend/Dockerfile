FROM python:3.10-slim-bullseye

RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

USER root
RUN find /usr/local/lib/python3.10 -name "*.so" -exec execstack -c {} \; 2>/dev/null || true
RUN find /home/user/.local -name "*.so" -exec execstack -c {} \; 2>/dev/null || true
USER user

COPY --chown=user . .

EXPOSE 7860

CMD ["python", "app.py"]