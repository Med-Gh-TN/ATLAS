"""
Schema package for spec-facing request/response models.

The current codebase still mixes router-local Pydantic models with legacy SQLModel
read/write models. This package is the Phase 3 landing zone for extracting those
contracts into a clean backend architecture.
"""
