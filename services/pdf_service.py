"""
NURO-BEATS Clinical PDF Export Service
services/pdf_service.py

Generates professional, printable, multi-page clinical rehabilitation reports
using pure-Python ReportLab with zero external C++ or system printer dependencies.
Compliant with hospital EMR progress note documentation standards.
"""

import io
import json
from datetime import datetime
from typing import Dict, Any, Optional

try:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
    )
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False


def generate_clinical_report_pdf(
    therapy_session: Any,
    clinical_report: Any,
    patient_profile: Any,
    summary: Optional[Any] = None,
    delta_info: Optional[Dict[str, Any]] = None,
    trend_info: Optional[str] = None,
    advisory_bpm: Optional[float] = None
) -> io.BytesIO:
    """
    Builds a polished, clinical PDF report and returns it in an in-memory BytesIO buffer.
    """
    if not REPORTLAB_AVAILABLE:
        raise RuntimeError("ReportLab library is not installed.")

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()

    # Custom clinical palette
    c_primary = colors.HexColor("#042046")     # Navy
    c_accent = colors.HexColor("#01aac5")      # Medical cyan
    c_dark = colors.HexColor("#1e293b")        # Slate dark
    c_gray = colors.HexColor("#64748b")        # Slate gray
    c_light = colors.HexColor("#f8fafc")       # Slate light
    c_border = colors.HexColor("#e2e8f0")      # Table border
    c_success = colors.HexColor("#16a34a")     # Green
    c_card_bg = colors.HexColor("#f1f5f9")     # Card fill

    # Typography styles
    style_title = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=c_primary
    )
    style_subtitle = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=c_gray
    )
    style_section_h1 = ParagraphStyle(
        'SectionH1',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=c_primary,
        spaceBefore=12,
        spaceAfter=6
    )
    style_section_h2 = ParagraphStyle(
        'SectionH2',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=c_accent,
        spaceBefore=8,
        spaceAfter=4
    )
    style_body = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=c_dark
    )
    style_body_bold = ParagraphStyle(
        'BodyBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=13.5,
        textColor=c_dark
    )
    style_bullet = ParagraphStyle(
        'Bullet',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=c_dark,
        leftIndent=12
    )
    style_disclaimer = ParagraphStyle(
        'Disclaimer',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8,
        leading=11,
        textColor=c_gray
    )

    story = []

    # 1. Header & Hospital Branding
    header_data = [
        [
            Paragraph("<b>NURO-BEATS REHABILITATION PLATFORM</b><br/><font color='#01aac5' size='9'>CLINICAL PROGRESS & AUDIT REPORT</font>", style_title),
            Paragraph(f"<b>Session ID:</b> #{therapy_session.id}<br/><b>Date:</b> {therapy_session.start_time.strftime('%Y-%m-%d %H:%M') if therapy_session.start_time else 'N/A'}<br/><b>Status:</b> {'COMPLETED' if therapy_session.completed else 'IN PROGRESS'}", style_subtitle)
        ]
    ]
    t_header = Table(header_data, colWidths=[360, 180])
    t_header.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(t_header)
    story.append(HRFlowable(width="100%", thickness=2, color=c_primary, spaceBefore=4, spaceAfter=10))

    # 2. Patient Demographics & Profile
    patient_user = patient_profile.user if patient_profile and hasattr(patient_profile, 'user') else None
    patient_name = f"{patient_user.first_name} {patient_user.last_name}" if patient_user else f"Patient #{patient_profile.id if patient_profile else 'Unknown'}"
    condition_str = patient_profile.condition.title() if patient_profile and patient_profile.condition else "Neurological Recovery"

    demo_data = [
        [
            Paragraph("<b>Patient Name:</b>", style_body_bold), Paragraph(patient_name, style_body),
            Paragraph("<b>Primary Condition:</b>", style_body_bold), Paragraph(condition_str, style_body)
        ],
        [
            Paragraph("<b>Activity Type:</b>", style_body_bold), Paragraph(therapy_session.session_type.replace('_', ' ').title(), style_body),
            Paragraph("<b>Elapsed Duration:</b>", style_body_bold), Paragraph(f"{therapy_session.duration_seconds or 0} seconds ({round((therapy_session.duration_seconds or 0)/60, 1)} min)", style_body)
        ],
        [
            Paragraph("<b>Baseline Cadence:</b>", style_body_bold), Paragraph(f"{round(patient_profile.baseline_cadence or therapy_session.initial_bpm)} SPM", style_body),
            Paragraph("<b>Target Cadence:</b>", style_body_bold), Paragraph(f"{round(patient_profile.target_cadence or therapy_session.target_bpm)} SPM", style_body)
        ]
    ]
    t_demo = Table(demo_data, colWidths=[110, 160, 120, 150])
    t_demo.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), c_light),
        ('BOX', (0, 0), (-1, -1), 0.5, c_border),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, c_border),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(t_demo)
    story.append(Spacer(1, 10))

    # 3. Quantitative Kinematic & Pacing Metrics
    story.append(Paragraph("1. Session Metrics & Telemetry", style_section_h1))
    
    acc_val = therapy_session.accuracy_score
    acc_display = f"{round(acc_val, 1)}%" if acc_val is not None else "Unavailable"
    initial_bpm = round(therapy_session.initial_bpm or 60.0)
    final_bpm = round(therapy_session.final_bpm or therapy_session.initial_bpm or 60.0)
    steps_l = getattr(therapy_session, 'left_steps', 0)
    steps_r = getattr(therapy_session, 'right_steps', 0)
    total_steps = steps_l + steps_r if (steps_l + steps_r) > 0 else (getattr(therapy_session, 'total_steps', 0) or 0)
    gait_sym = getattr(therapy_session, 'gait_symmetry', None)
    sym_display = f"{round(gait_sym, 1)}%" if gait_sym is not None else "Unavailable"

    metrics_table_data = [
        [
            Paragraph("<b>Cadence Progression</b>", style_body_bold),
            Paragraph("<b>Rhythm Entrainment</b>", style_body_bold),
            Paragraph("<b>Movement Count</b>", style_body_bold),
            Paragraph("<b>Bilateral Symmetry</b>", style_body_bold)
        ],
        [
            Paragraph(f"<font size='14' color='#042046'><b>{initial_bpm} → {final_bpm}</b></font> BPM", style_body),
            Paragraph(f"<font size='14' color='#16a34a'><b>{acc_display}</b></font>", style_body),
            Paragraph(f"<font size='14' color='#042046'><b>{total_steps}</b></font> cycles", style_body),
            Paragraph(f"<font size='14' color='#042046'><b>{sym_display}</b></font>", style_body)
        ]
    ]
    t_metrics = Table(metrics_table_data, colWidths=[135, 135, 135, 135])
    t_metrics.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), c_primary),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOX', (0, 0), (-1, -1), 1, c_border),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, c_border),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(t_metrics)
    story.append(Spacer(1, 10))

    # 4. Longitudinal Comparison & Trend
    if delta_info or trend_info or advisory_bpm:
        story.append(Paragraph("2. Longitudinal Trend & Progression", style_section_h1))
        trend_text = trend_info.upper() if trend_info else "STABLE"
        delta_str = delta_info.get('text', 'First session on record') if delta_info else "N/A"
        adv_str = f"{round(advisory_bpm, 1)} BPM" if advisory_bpm else f"{final_bpm} BPM"
        
        long_data = [
            [
                Paragraph("<b>Historical Trend:</b>", style_body_bold), Paragraph(trend_text, style_body),
                Paragraph("<b>Accuracy Delta:</b>", style_body_bold), Paragraph(delta_str, style_body)
            ],
            [
                Paragraph("<b>Advisory Next Cadence:</b>", style_body_bold), Paragraph(adv_str, style_body),
                Paragraph("<b>Pacing Recommendation:</b>", style_body_bold), Paragraph("Consolidate steady gait before incrementing tempo.", style_body)
            ]
        ]
        t_long = Table(long_data, colWidths=[140, 130, 130, 140])
        t_long.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), c_light),
            ('BOX', (0, 0), (-1, -1), 0.5, c_border),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, c_border),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(t_long)
        story.append(Spacer(1, 10))

    # 5. EMR Medical SOAP Progress Notes
    story.append(Paragraph("3. Medical SOAP Clinical Progress Documentation", style_section_h1))
    
    soap_subj = clinical_report.soap_subjective or "Patient participated actively in rhythmic auditory pacing protocol."
    soap_obj = clinical_report.soap_objective or f"Completed {therapy_session.duration_seconds}s at {initial_bpm}->{final_bpm} BPM with {acc_val}% synchronization accuracy."
    soap_assess = clinical_report.soap_assessment or "Demonstrated functional motor entrainment. Cadence stability maintained across exercise block."
    soap_plan = clinical_report.soap_plan or f"Continue RAS training at {adv_str if 'adv_str' in locals() else final_bpm} target cadence with active recovery intervals."

    soap_table_data = [
        [Paragraph("<b>Subjective (S)</b>", style_body_bold), Paragraph(soap_subj, style_body)],
        [Paragraph("<b>Objective (O)</b>", style_body_bold), Paragraph(soap_obj, style_body)],
        [Paragraph("<b>Assessment (A)</b>", style_body_bold), Paragraph(soap_assess, style_body)],
        [Paragraph("<b>Plan (P)</b>", style_body_bold), Paragraph(soap_plan, style_body)]
    ]
    t_soap = Table(soap_table_data, colWidths=[110, 430])
    t_soap.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), c_card_bg),
        ('BACKGROUND', (1, 0), (1, -1), colors.white),
        ('BOX', (0, 0), (-1, -1), 0.5, c_border),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, c_border),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(t_soap)
    story.append(Spacer(1, 10))

    # 6. Structured Observations & Actionable Next Steps
    def _parse_list(val):
        if not val:
            return []
        if isinstance(val, list):
            return val
        try:
            p = json.loads(val)
            if isinstance(p, list):
                return p
            return [str(p)]
        except Exception:
            return [str(val)]

    what_did = _parse_list(clinical_report.what_you_did)
    perf_obs = _parse_list(clinical_report.performance_observations)
    to_improve = _parse_list(clinical_report.what_to_improve)
    recs = _parse_list(clinical_report.recommendations)

    story.append(Paragraph("4. Clinical Observations & Next Steps", style_section_h1))
    
    obs_col_left = []
    obs_col_left.append(Paragraph("<b>What You Did:</b>", style_section_h2))
    for item in what_did or ["Completed prescribed rhythmic auditory stimulation."]:
        obs_col_left.append(Paragraph(f"• {item}", style_bullet))
    obs_col_left.append(Spacer(1, 4))
    obs_col_left.append(Paragraph("<b>Performance Observations:</b>", style_section_h2))
    for item in perf_obs or ["Consistent auditory-motor rhythm synchronization observed."]:
        obs_col_left.append(Paragraph(f"• {item}", style_bullet))

    obs_col_right = []
    obs_col_right.append(Paragraph("<b>Focus / What To Improve:</b>", style_section_h2))
    for item in to_improve or ["Maintain bilateral cadence stability during fatigue."]:
        obs_col_right.append(Paragraph(f"• {item}", style_bullet))
    obs_col_right.append(Spacer(1, 4))
    obs_col_right.append(Paragraph("<b>Recommendations for Next Session:</b>", style_section_h2))
    for item in recs or ["Proceed with advisory target pacing."]:
        obs_col_right.append(Paragraph(f"• {item}", style_bullet))

    t_obs = Table([[obs_col_left, obs_col_right]], colWidths=[265, 275])
    t_obs.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BACKGROUND', (0, 0), (-1, -1), c_light),
        ('BOX', (0, 0), (-1, -1), 0.5, c_border),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, c_border),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(t_obs)
    story.append(Spacer(1, 14))

    # 7. Clinician Signature Line & Confidentiality Disclaimer
    sig_data = [
        [
            Paragraph("<b>Assigned Clinician:</b><br/>____________________________<br/>Signature & License ID", style_disclaimer),
            Paragraph(f"<b>Report Engine:</b> {clinical_report.ai_model or 'gemini-2.5-flash'}<br/><b>Generated At:</b> {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC<br/>CONFIDENTIAL MEDICAL PROGRESS RECORD", style_disclaimer)
        ]
    ]
    t_sig = Table(sig_data, colWidths=[270, 270])
    t_sig.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(KeepTogether([
        HRFlowable(width="100%", thickness=0.5, color=c_border, spaceBefore=4, spaceAfter=6),
        t_sig
    ]))

    doc.build(story)
    buffer.seek(0)
    return buffer
