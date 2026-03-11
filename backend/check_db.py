
import asyncio
import asyncpg
from app.core.config import settings

async def check_db():
    print(f"Connecting to: {settings.POSTGRES_SERVER} as {settings.POSTGRES_USER}")
    
    host = "127.0.0.1"
    port = 5433
    
    if ":" in settings.POSTGRES_SERVER:
        h, p = settings.POSTGRES_SERVER.split(":")
        host = h
        port = int(p)
        
    try:
        conn = await asyncpg.connect(
            user=settings.POSTGRES_USER,
            password=settings.POSTGRES_PASSWORD,
            database=settings.POSTGRES_DB,
            host=host,
            port=port
        )
        print("Successfully connected to the database!")
        await conn.close()
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(check_db())
