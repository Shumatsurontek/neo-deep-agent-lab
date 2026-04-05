from enum import Enum


class LLMProvider(str, Enum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    OLLAMA = "ollama"


class SSEEventType(str, Enum):
    TEXT_DELTA = "text-delta"
    TOOL_CALL_START = "tool-call-start"
    TOOL_CALL_END = "tool-call-end"
    INTERRUPT_REQUEST = "interrupt-request"
    ERROR = "error"
    DONE = "done"
    METRICS = "metrics"
    FINETUNE_START = "finetune-start"
    FINETUNE_PROGRESS = "finetune-progress"
    FINETUNE_VALIDATION = "finetune-validation"
    FINETUNE_SAVING = "finetune-saving"
    FINETUNE_DONE = "finetune-done"
    FINETUNE_ERROR = "finetune-error"


class SQLKeyword(str, Enum):
    SELECT = "SELECT"
    WITH = "WITH"
    EXPLAIN = "EXPLAIN"


ALLOWED_SQL_KEYWORDS = frozenset({kw.value for kw in SQLKeyword})

FORBIDDEN_SQL_KEYWORDS = frozenset(
    {
        "DROP",
        "DELETE",
        "UPDATE",
        "INSERT",
        "ALTER",
        "TRUNCATE",
        "CREATE",
        "GRANT",
        "REVOKE",
        "VACUUM",
        "REINDEX",
    }
)

DEFAULT_MAX_RESULT_ROWS = 50
DEFAULT_SQL_TIMEOUT_MS = 10_000
DEFAULT_SERVER_PORT = 8080
MODAL_APP_NAME = "neo-deep-agent-lab"
PG_USER = "postgres"
PG_DATABASE = "postgres"
