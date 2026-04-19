#!/bin/bash
export LD_LIBRARY_PATH=/home/msi/.local/lib/python3.10/site-packages/nvidia/cublas/lib:/home/msi/.local/lib/python3.10/site-packages/nvidia/cudnn/lib:/home/msi/.local/lib/python3.10/site-packages/nvidia/curand/lib:/home/msi/.local/lib/python3.10/site-packages/nvidia/cufft/lib:/home/msi/.local/lib/python3.10/site-packages/nvidia/cusparse/lib:/home/msi/.local/lib/python3.10/site-packages/nvidia/cusolver/lib:$LD_LIBRARY_PATH

# Bypass the unreliable activation script and use the venv Python binary directly
venv/bin/python src/server.py
