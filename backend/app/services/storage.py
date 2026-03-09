
import io
import hashlib
from minio import Minio
from minio.error import S3Error
from app.core.config import settings

class MinioClient:
    def __init__(self):
        self.client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE
        )
        self.bucket_name = settings.MINIO_BUCKET_NAME
        self._ensure_bucket_exists()

    def _ensure_bucket_exists(self):
        if not self.client.bucket_exists(self.bucket_name):
            self.client.make_bucket(self.bucket_name)

    def upload_file(self, file_data: bytes, file_name: str, content_type: str) -> str:
        try:
            result = self.client.put_object(
                self.bucket_name,
                file_name,
                io.BytesIO(file_data),
                length=len(file_data),
                content_type=content_type
            )
            return file_name
        except S3Error as e:
            raise Exception(f"Failed to upload to MinIO: {e}")

    def get_file_url(self, object_name: str) -> str:
        return self.client.presigned_get_object(self.bucket_name, object_name)

minio_client = MinioClient()

def calculate_sha256(file_data: bytes) -> str:
    return hashlib.sha256(file_data).hexdigest()
