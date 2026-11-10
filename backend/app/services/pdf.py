"""
PDF generation service.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import List, Dict, Any

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

from config import Settings

settings = Settings()


class EvidencePDFService:
    """Service for generating evidence PDFs."""
    
    def __init__(self):
        self.styles = getSampleStyleSheet()
        self.styles.add(ParagraphStyle(
            name="CustomNormal",
            parent=self.styles["Normal"],
            fontSize=10,
            leading=14
        ))
        self.styles.add(ParagraphStyle(
            name="CustomTitle",
            parent=self.styles["Title"],
            fontSize=14,
            textColor=colors.darkblue
        ))
    
    def generate_evidence_pdf(
        self,
        worker_alias: str,
        entries: List[Dict[str, Any]],
        output_path: str
    ) -> str:
        """
        Generate an evidence PDF summary.
        
        Args:
            worker_alias: Worker's alias
            entries: List of entry data
            output_path: Path to save the PDF
            
        Returns:
            Path to the generated PDF
        """
        doc = SimpleDocTemplate(
            output_path,
            pagesize=A4,
            rightMargin=2*cm,
            leftMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2*cm
        )
        
        story = []
        
        # Title
        story.append(Paragraph("WAGE EVIDENCE PACK", self.styles["CustomTitle"]))
        story.append(Spacer(1, 1*cm))
        
        # Worker info
        story.append(Paragraph(f"Worker: {worker_alias}", self.styles["CustomNormal"]))
        story.append(Paragraph(f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC", self.styles["CustomNormal"]))
        story.append(Spacer(1, 1*cm))
        
        # Table header
        data = [
            ["Date", "Site", "Contractor", "Hours", "Agreed", "Paid", "Due", "Status"]
        ]
        
        # Table rows
        for entry in entries:
            data.append([
                entry.get("work_date", ""),
                entry.get("site_name", "") or "",
                entry.get("counterparty_name", "") or "",
                str(entry.get("hours", "")) if entry.get("hours") else "",
                f"₹{entry.get('agreed_inr', 0)}",
                f"₹{entry.get('paid_inr', 0)}",
                f"₹{entry.get('due_inr', 0)}",
                entry.get("status", "")
            ])
        
        # Create table
        table = Table(data, colWidths=[2*cm, 3*cm, 3*cm, 1.5*cm, 2*cm, 2*cm, 2*cm, 2*cm])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ]))
        
        story.append(table)
        story.append(Spacer(1, 2*cm))
        
        # Disclaimer
        story.append(Paragraph(
            "NOTE: This record is provided for reference purposes only. "
            "Its legal admissibility should be verified with appropriate legal counsel.",
            self.styles["CustomNormal"]
        ))
        
        # Build PDF
        doc.build(story)
        
        return output_path
