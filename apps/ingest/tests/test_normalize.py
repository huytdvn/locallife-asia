from app.pipeline.normalize import normalize
from app.pipeline.parsers import ParsedDoc


def test_normalize_collapses_blank_lines() -> None:
    doc = ParsedDoc(text="Line 1\n\n\n\nLine 2\n   \nLine 3")
    out = normalize(doc)
    assert "Line 1\n\nLine 2" in out
    assert "\n\n\n" not in out


def test_normalize_renders_table() -> None:
    doc = ParsedDoc(text="Intro", tables=[[["H1", "H2"], ["a", "b"], ["c", "d"]]])
    out = normalize(doc)
    assert "| H1 | H2 |" in out
    assert "| --- | --- |" in out
    assert "| a | b |" in out


def test_normalize_escapes_pipe() -> None:
    doc = ParsedDoc(text="", tables=[[["A|B"], ["C"]]])
    out = normalize(doc)
    assert r"A\|B" in out
