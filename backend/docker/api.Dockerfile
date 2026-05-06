
FROM python:3.11-slim

WORKDIR /app

# [OMNI-ARCHITECT FIX]: Added libgl1 and libglib2.0-0 to support OpenCV/Docling
RUN apt-get update && apt-get install -y \
    poppler-utils \
    tesseract-ocr \
    libpoppler-cpp-dev \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r /app/requirements.txt

COPY backend /app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]