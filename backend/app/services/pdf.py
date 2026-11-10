"""
PDF generation service.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

try:
    from app.config import Settings
except ImportError:
    from config import Settings

settings = Settings()


class EvidencePDFService:
    """Service for generating evidence PDFs."""

    def __init__(self):
        self.styles = getSampleStyleSheet()
        self.styles.add(
            ParagraphStyle(
                name="CustomNormal",
                parent=self.styles["Normal"],
                fontSize=10,
                leading=14,
            )
        )
        self.styles.add(
            ParagraphStyle(
                name="CustomTitle",
                parent=self.styles["Title"],
                fontSize=14,
                textColor=colors.darkblue,
            )
        )

    def generate_evidence_pdf(
        self,
        worker_alias: str,
        entries: list[dict[str, Any]],
        output_path: str,
        period_from: str | None = None,
        period_to: str | None = None,
    ) -> str:
        """
        Generate an evidence PDF summary.

        Args:
            worker_alias: Worker's alias
            entries: List of entry data
            output_path: Path to save the PDF
            period_from: Optional start date (YYYY-MM-DD)
            period_to: Optional end date (YYYY-MM-DD)

        Returns:
            Path to the generated PDF
        """
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            rightMargin=2 * cm,
            leftMargin=2 * cm,
            topMargin=2 * cm,
            bottomMargin=2 * cm,
        )

        story = []

        # Title
        story.append(Paragraph("WAGE EVIDENCE PACK", self.styles["CustomTitle"]))
        story.append(Spacer(1, 0.7 * cm))

        # Worker info (escape XML special characters for ReportLab Paragraph)
        story.append(
            Paragraph(f"Worker: {escape(worker_alias)}", self.styles["CustomNormal"])
        )
        if period_from and period_to:
            story.append(
                Paragraph(
                    f"Period: {escape(period_from)} to {escape(period_to)}",
                    self.styles["CustomNormal"],
                )
            )
        story.append(
            Paragraph(
                f"Generated: {datetime.now(UTC).strftime('%Y-%m-%d %H:%M:%S')} UTC",
                self.styles["CustomNormal"],
            )
        )
        story.append(Spacer(1, 0.8 * cm))

        # Table header
        data = [
            ["Date", "Site", "Contractor", "Hours", "Agreed", "Paid", "Due", "Status"]
        ]

        # Table rows (use INR prefix so built-in Helvetica renders clearly without missing glyph boxes)
        for entry in entries:
            data.append(
                [
                    entry.get("work_date", ""),
                    entry.get("site_name", "") or "",
                    entry.get("counterparty_name", "") or "",
                    (
                        str(entry.get("hours", ""))
                        if entry.get("hours") is not None
                        else ""
                    ),
                    f"INR {entry.get('agreed_inr', 0)}",
                    f"INR {entry.get('paid_inr', 0)}",
                    f"INR {entry.get('due_inr', 0)}",
                    entry.get("status", ""),
                ]
            )

        # Create table
        table = Table(
            data,
            colWidths=[
                2 * cm,
                3 * cm,
                3 * cm,
                1.5 * cm,
                2 * cm,
                2 * cm,
                2 * cm,
                2 * cm,
            ],
        )
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.darkblue),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 10),
                    ("FONTSIZE", (0, 1), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
                    ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
                    ("GRID", (0, 0), (-1, -1), 1, colors.black),
                ]
            )
        )

        story.append(table)
        story.append(Spacer(1, 2 * cm))

        # Disclaimer
        story.append(
            Paragraph(
                "NOTE: This record is provided for reference purposes only. "
                "Its legal admissibility should be verified with appropriate legal counsel.",
                self.styles["CustomNormal"],
            )
        )

        # Build PDF
        doc.build(story)

        return output_path
