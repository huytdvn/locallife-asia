from datetime import date

from app.pipeline.frontmatter import (
    Audience,
    FrontMatter,
    Sensitivity,
    SourceRef,
    new_draft,
    to_markdown,
)


def test_new_draft_has_ulid() -> None:
    fm = new_draft(
        title="Chính sách X",
        owner="hr@locallife.asia",
        source=SourceRef(type="manual", path="raw-ulid/x.md", captured_at=date.today()),
        suggested_audience=[Audience.employee],
        suggested_sensitivity=Sensitivity.internal,
        tags=["hr"],
    )
    assert len(fm.id) == 26  # ULID
    assert fm.status == "draft"


def test_roundtrip_markdown() -> None:
    fm = FrontMatter(
        id="01HTEST" + "0" * 19,
        title="T",
        owner="a@b.c",  # type: ignore[arg-type]
        audience=[Audience.employee],
        sensitivity=Sensitivity.internal,
        tags=["a"],
        last_reviewed=date(2026, 1, 1),
        reviewer="a@b.c",  # type: ignore[arg-type]
        status="approved",
    )
    md = to_markdown(fm, "Body here.")
    assert md.startswith("---\n")
    assert "title: T" in md
    assert md.endswith("Body here.\n")
