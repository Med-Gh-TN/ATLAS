from app.models.user import (
    User,
    UserRole,
    StudentLevel,
    UserBase,
    UserCreate,
    UserRead,
    OTPToken,
    OTPPurpose,
    TeacherProfile,
    TeacherVerificationRequest,
    TeacherRequestStatus,
    Establishment,
    Department,
    UserStreak,          # ← relocated from gamification
)
from app.models.contribution import (
    Contribution,
    ContributionStatus,
    ContributionCreate,
    ContributionRead,
    DocumentVersion,
    DocumentPipelineStatus,
    ContributorRequest,
    ContributorRequestStatus,
)
from app.models.course import Course
from app.models.embedding import DocumentEmbedding
from app.models.rag import RAGSession, Message
from app.models.study_tools import (
    FlashcardDeck,
    Flashcard,
    DifficultyLevel,
    QuizSession,
    Question,
    MindMap,
    Summary,
    SummaryFormat,
    AcademicAssetType,
    AcademicAssetCache,
)
from app.models.annotation import DocumentAnnotation
from app.models.intelligence import (
    UserProfile,
    TopicKnowledge,
    UserMemory,
    LearningInsight,
    LearningSpeed,
    LearningStyle,
)
from app.models.collaboration import (
    LearningPathJob,
    LearningPathJobStatus,
)
from app.models.notification import Notification
from app.models.progress import ReadingProgress
from app.models.major import Major
from app.models.study_goals import DailyGoal, StudySession


__all__ = [
    "User",
    "UserRole",
    "StudentLevel",
    "UserBase",
    "UserCreate",
    "UserRead",
    "TeacherProfile",
    "TeacherVerificationRequest",
    "TeacherRequestStatus",
    "Establishment",
    "Contribution",
    "ContributionStatus",
    "ContributionCreate",
    "ContributionRead",
    "DocumentVersion",
    "DocumentPipelineStatus",
    "ContributorRequest",
    "ContributorRequestStatus",
    "DocumentEmbedding",
    "UserStreak",              # ← relocated
    "OTPToken",
    "OTPPurpose",
    "Course",
    "Department",
    "RAGSession",
    "Message",
    "FlashcardDeck",
    "Flashcard",
    "DifficultyLevel",
    "QuizSession",
    "Question",
    "MindMap",
    "Summary",
    "SummaryFormat",
    "AcademicAssetType",
    "AcademicAssetCache",
    "DocumentAnnotation",
    "Notification",
    "ReadingProgress",
    "UserProfile",
    "TopicKnowledge",
    "UserMemory",
    "LearningInsight",
    "LearningSpeed",
    "LearningStyle",
    "LearningPathJob",
    "LearningPathJobStatus",
    "Major",
    "DailyGoal",
    "StudySession",
]