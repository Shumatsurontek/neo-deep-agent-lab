"""Tests for the SQL guard middleware."""

from src.middleware.sql_guard import validate_sql_query


class TestValidateSqlQuery:
    """Test SQL query validation."""

    def test_select_allowed(self) -> None:
        assert validate_sql_query("SELECT * FROM users") is None

    def test_select_lowercase_allowed(self) -> None:
        assert validate_sql_query("select count(*) from agents") is None

    def test_with_cte_allowed(self) -> None:
        assert validate_sql_query("WITH cte AS (SELECT 1) SELECT * FROM cte") is None

    def test_explain_allowed(self) -> None:
        assert validate_sql_query("EXPLAIN SELECT * FROM users") is None

    def test_drop_blocked(self) -> None:
        result = validate_sql_query("DROP TABLE users")
        assert result is not None
        assert "DROP" in result

    def test_delete_blocked(self) -> None:
        result = validate_sql_query("DELETE FROM users WHERE id = 1")
        assert result is not None
        assert "DELETE" in result

    def test_update_blocked(self) -> None:
        result = validate_sql_query("UPDATE users SET name = 'hacked'")
        assert result is not None
        assert "UPDATE" in result

    def test_insert_blocked(self) -> None:
        result = validate_sql_query("INSERT INTO users VALUES (1, 'test')")
        assert result is not None
        assert "INSERT" in result

    def test_alter_blocked(self) -> None:
        result = validate_sql_query("ALTER TABLE users ADD COLUMN evil text")
        assert result is not None
        assert "ALTER" in result

    def test_truncate_blocked(self) -> None:
        result = validate_sql_query("TRUNCATE users")
        assert result is not None
        assert "TRUNCATE" in result

    def test_create_blocked(self) -> None:
        result = validate_sql_query("CREATE TABLE evil (id int)")
        assert result is not None
        assert "CREATE" in result

    def test_grant_blocked(self) -> None:
        result = validate_sql_query("GRANT ALL ON users TO public")
        assert result is not None
        assert "GRANT" in result

    def test_revoke_blocked(self) -> None:
        result = validate_sql_query("REVOKE ALL ON users FROM postgres")
        assert result is not None
        assert "REVOKE" in result

    def test_vacuum_blocked(self) -> None:
        result = validate_sql_query("VACUUM FULL users")
        assert result is not None
        assert "VACUUM" in result

    def test_empty_query_blocked(self) -> None:
        result = validate_sql_query("")
        assert result is not None
        assert "Empty" in result

    def test_whitespace_only_blocked(self) -> None:
        result = validate_sql_query("   ")
        assert result is not None
        assert "Empty" in result

    def test_unknown_keyword_blocked(self) -> None:
        result = validate_sql_query("COPY users TO '/tmp/evil.csv'")
        assert result is not None
        assert "Unknown" in result

    def test_select_with_leading_whitespace(self) -> None:
        assert validate_sql_query("  SELECT 1") is None

    def test_select_with_semicolon(self) -> None:
        assert validate_sql_query("SELECT 1;") is None
