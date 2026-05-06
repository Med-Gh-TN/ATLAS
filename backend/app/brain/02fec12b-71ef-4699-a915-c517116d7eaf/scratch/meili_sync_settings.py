import os
import meilisearch
from dotenv import load_dotenv

# Load env from .env if it exists
if os.path.exists(".env"):
    load_dotenv()

MEILI_URL = os.getenv("MEILI_URL", "http://localhost:7700")
MEILI_MASTER_KEY = os.getenv("MEILI_MASTER_KEY", "meili_master_key")

def sync_settings():
    client = meilisearch.Client(MEILI_URL, MEILI_MASTER_KEY)
    index = client.index("documents")
    
    print(f"Connecting to MeiliSearch at {MEILI_URL}...")
    
    settings = {
        "filterableAttributes": [
            "level", 
            "filiere", 
            "academic_year", 
            "course_type", 
            "language", 
            "is_official",
            "document_version_id"
        ],
        "typoTolerance": {
            "enabled": True,
            "minWordSizeForTypos": {"oneTypo": 4, "twoTypos": 8}
        }
    }
    
    print("Updating index settings...")
    task = index.update_settings(settings)
    print(f"Task queued: {task.task_uid}")
    
    # Optional: Wait for task completion
    # import time
    # while True:
    #     status = client.get_task(task.task_uid)
    #     print(f"Status: {status.status}")
    #     if status.status in ('succeeded', 'failed'):
    #         break
    #     time.sleep(1)

if __name__ == "__main__":
    sync_settings()
