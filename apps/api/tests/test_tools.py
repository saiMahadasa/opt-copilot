"""
Unit tests for tools.check_stem_eligibility and tools.search_stem_by_keyword.

These tests hit the real stem_cip_codes.json (no mocking needed — the file is
part of the repo).  Known-good / known-bad codes are drawn from the published
2024-07-22 DHS STEM Designated Degree Program List.

Known-good codes (present on the list):
    11.0101  Computer and Information Sciences, General
    14.0101  Engineering, General

Known-bad code (real CIP code, NOT on the STEM list):
    52.0101  Business/Commerce, General

Non-existent code (invalid format / not a real CIP):
    99.9999  (does not exist anywhere)
"""

import pytest
from tools import check_stem_eligibility, search_stem_by_keyword


# ── check_stem_eligibility ────────────────────────────────────────────────────

class TestCheckStemEligibility:

    def test_known_good_code_is_eligible(self):
        result = check_stem_eligibility("11.0101")
        assert result["eligible"] is True
        assert result["field_of_study"] is not None
        assert "computer" in result["field_of_study"].lower()
        assert result["list_updated"] == "2024-07-22"

    def test_known_bad_code_is_not_eligible(self):
        """52.0101 (Business/Commerce) is a real CIP code not on the STEM list."""
        result = check_stem_eligibility("52.0101")
        assert result["eligible"] is False
        assert result["field_of_study"] is None
        assert result["list_updated"] == "2024-07-22"

    def test_nonexistent_code_is_not_eligible(self):
        """99.9999 is not a real CIP code and must not be eligible."""
        result = check_stem_eligibility("99.9999")
        assert result["eligible"] is False
        assert result["field_of_study"] is None
        assert result["list_updated"] == "2024-07-22"

    def test_engineering_code_is_eligible(self):
        result = check_stem_eligibility("14.0101")
        assert result["eligible"] is True
        assert result["field_of_study"] is not None

    def test_strips_whitespace_from_input(self):
        """Leading/trailing spaces in the input should not break lookup."""
        result = check_stem_eligibility("  11.0101  ")
        assert result["eligible"] is True

    def test_returns_list_updated_date(self):
        result = check_stem_eligibility("11.0101")
        assert result["list_updated"] == "2024-07-22"


# ── search_stem_by_keyword ────────────────────────────────────────────────────

class TestSearchStemByKeyword:

    def test_keyword_with_multiple_matches_returns_up_to_five(self):
        """'engineering' matches many entries; result must be capped at 5."""
        results = search_stem_by_keyword("engineering")
        assert 1 <= len(results) <= 5
        for r in results:
            assert "engineering" in r["field_of_study"].lower()
            assert "cip_code" in r
            assert r["list_updated"] == "2024-07-22"

    def test_keyword_with_no_matches_returns_empty_list(self):
        results = search_stem_by_keyword("zzznomatch_xyz_9999")
        assert results == []

    def test_case_insensitive_match(self):
        """'Computer Science' and 'computer science' should return the same hit."""
        upper_results = search_stem_by_keyword("Computer Science")
        lower_results = search_stem_by_keyword("computer science")
        assert upper_results == lower_results

    def test_results_sorted_by_cip_code(self):
        results = search_stem_by_keyword("biology")
        codes = [r["cip_code"] for r in results]
        assert codes == sorted(codes)

    def test_exact_field_name_match(self):
        """Searching for a known exact field name returns that entry."""
        results = search_stem_by_keyword("Computer Science")
        matched_codes = [r["cip_code"] for r in results]
        assert "11.0701" in matched_codes

    def test_result_structure(self):
        results = search_stem_by_keyword("mathematics")
        assert len(results) > 0
        for r in results:
            assert set(r.keys()) == {"cip_code", "field_of_study", "list_updated"}
