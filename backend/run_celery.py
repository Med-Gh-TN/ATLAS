import os
import sys
import logging
from pathlib import Path

# ==========================================
# PRE-FLIGHT ENVIRONMENT BOOTSTRAP
# ==========================================
# DEFENSIVE ARCHITECTURE: Must occur before ANY application imports.
# This ensures the "Lego architecture" has configuration state ready before Pydantic evaluates.
try:
    from dotenv import load_dotenv
except ImportError:
    raise ImportError("CRITICAL SYSTEM FAILURE: 'python-dotenv' is required for the bootloader. Please install it.")

# Establish Pre-Flight Logging (Auditing Side-Effect)
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [BOOTSTRAP] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("run_celery")

def pre_flight_check():
    """
    Forces synchronous loading of the .env file.
    Prevents race conditions between environment injection and Celery app initialization.
    """
    # Dynamically resolve the absolute path to prevent execution context errors
    root_dir = Path(__file__).resolve().parent
    env_path = root_dir / ".env"

    if env_path.exists():
        logger.info(f"Targeting environment configuration at: {env_path}")
        # override=True ensures .env takes precedence over stale system variables during dev
        load_dotenv(dotenv_path=env_path, override=True)
        logger.info("Environment variables successfully injected into process space.")
    else:
        logger.warning("No local .env file found. Depending entirely on OS-level/Container environment variables.")

# 1. Execute Environment Bootstrap synchronously
pre_flight_check()

# 2. Safe to import Celery now that os.environ is fully populated
from celery.__main__ import main

if __name__ == "__main__":
    logger.info("Handing over control to Celery execution engine...")
    # Passes any CLI arguments (like 'worker -l info') directly to Celery
    sys.exit(main())