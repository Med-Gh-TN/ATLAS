from app.models.new.user import User, UserRole, StudentLevel, UserBase, UserCreate, UserRead
from app.models.new.contribution import Contribution, ContributionStatus, ContributionCreate, ContributionRead, DocumentVersion, DocumentPipelineStatus
from app.models.new.embedding import DocumentEmbedding
from app.models.new.gamification import XPTransaction, XPTransactionType

# Re-export for compatibility
__all__ = [
    "User", "UserRole", "StudentLevel", "UserBase", "UserCreate", "UserRead",
    "Contribution", "ContributionStatus", "ContributionCreate", "ContributionRead",
    "DocumentVersion", "DocumentPipelineStatus",
    "DocumentEmbedding",
    "XPTransaction", "XPTransactionType"
]
