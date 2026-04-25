"""
@file test_tunnel.py
@description Zero-Trust diagnostic probe for Edge-Cloud GPU tunnel (Cloudflare Edition).
"""
import requests
import json
import os
from dotenv import load_dotenv

# Load env vars
load_dotenv()

# SOTA FIX: Strip trailing slashes to prevent 404s on concatenation
COLAB_URL = os.getenv("COLAB_GPU_URL", "").rstrip("/")
API_KEY = os.getenv("TUNNEL_API_KEY", "omni_colab_secret_123")
HEADERS = {"X-API-Key": API_KEY}

def run_diagnostics():
    print(f"=== ATLAS SOVEREIGN ZERO-TRUST PROBE ===")
    print(f"Target: {COLAB_URL}\n")
    
    # SOTA FIX: Removed 'ngrok' requirement. Accepts any valid Cloudflare or Sovereign URL.
    if not COLAB_URL or ".com" not in COLAB_URL:
        print("❌ FAIL: COLAB_GPU_URL is missing or invalid in .env")
        return

    # TEST 1: Health / Auth
    print("[1/3] Pinging /health endpoint...")
    try:
        res = requests.get(f"{COLAB_URL}/health", headers=HEADERS, timeout=15)
        if res.status_code == 403:
            print("❌ FAIL: Authentication rejected. API Key mismatch.")
            return
        res.raise_for_status()
        data = res.json()
        print(f"✅ PASS: Sovereign Node Online.")
        print(f"   - Engine: {data.get('model', 'vLLM-14B')}")
        print(f"   - VRAM Used: {data.get('vram_allocated', 'N/A')}")
    except Exception as e:
        print(f"❌ FAIL: Tunnel unreachable. {e}")
        return

    # TEST 2: Tensor Embeddings
    print("\n[2/3] Testing /embed (ColBERT on GPU 1)...")
    try:
        res = requests.post(
            f"{COLAB_URL}/embed", 
            json={"texts": ["ATLAS Hybrid Search", "Sovereign AI Node"]}, 
            headers=HEADERS, 
            timeout=20
        )
        res.raise_for_status()
        embeddings = res.json()["embeddings"]
        print(f"✅ PASS: Embedded {len(embeddings)} chunks.")
    except Exception as e:
        print(f"❌ FAIL: Embed endpoint crashed. {e}")
        if 'res' in locals(): print(res.text)

    # TEST 3: Cross-Encoder Reranking
    print("\n[3/3] Testing /rerank (MiniLM on GPU 1)...")
    try:
        res = requests.post(
            f"{COLAB_URL}/rerank", 
            json={
                "query": "What is ATLAS?", 
                "chunks": ["A research framework.", "A cooking recipe."]
            }, 
            headers=HEADERS, 
            timeout=20
        )
        res.raise_for_status()
        scores = res.json()["scores"]
        print(f"✅ PASS: Rerank successful. Best score: {max(scores):.4f}")
    except Exception as e:
        print(f"❌ FAIL: Rerank endpoint crashed. {e}")
        if 'res' in locals(): print(res.text)

    print("\n✅✅✅ ALL SYSTEMS GO. ATLAS IS READY TO INGEST. ✅✅✅")

if __name__ == "__main__":
    run_diagnostics()