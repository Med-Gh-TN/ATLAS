import sys
import os
import traceback

# 1. Force Context Injection
current_dir = os.path.abspath(os.path.dirname(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

print("==================================================")
print(" OMNI-ARCHITECT DIAGNOSTIC PROBE")
print("==================================================")
print(f"Target Directory: {current_dir}")

# 2. Structural Sanity Check
app_path = os.path.join(current_dir, "app", "main.py")
if not os.path.exists(app_path):
    print(f"CRITICAL FAILURE: The file does not exist at {app_path}")
    print("Your directory structure is corrupted or you are in the wrong folder.")
    sys.exit(1)

print("Structural check passed. Attempting strict import...")
print("--------------------------------------------------")

# 3. Boot Execution & Traceback Capture
try:
    from app.main import app
    print("\nSUCCESS: The application logic compiled and booted perfectly.")
    print("The previous error was purely a terminal pathing anomaly.")
    print("Resolution: Start your server using the module switch:")
    print("python -m uvicorn app.main:app --reload --port 8000")
except Exception as e:
    print("\n!!! FATAL BOOT EXCEPTION CAUGHT (Uvicorn was masking this) !!!\n")
    traceback.print_exc()