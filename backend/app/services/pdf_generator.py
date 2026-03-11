"""
상담 결과 PDF 생성 — ReportLab (한글 폰트 지원)

한글 렌더링: reportlab.pdfbase.ttfonts.TTFont
폰트 우선순위: NanumGothic (시스템) → 기본 폰트 fallback
"""
import os
import io
from datetime import datetime
from typing import Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ─── 디자인 토큰 ────────────────────────────────────────────────────────────
PRIMARY = HexColor("#1B6B5A")
ACCENT = HexColor("#E8913A")
DANGER = HexColor("#D64545")
LIGHT_GRAY = HexColor("#F5F5F5")
DARK_GRAY = HexColor("#333333")
TEXT_GRAY = HexColor("#666666")


def _register_korean_font() -> str:
    """
    시스템에서 사용 가능한 한글 폰트 등록

    Returns:
        등록된 폰트 이름 (ReportLab에서 사용할 이름)
    """
    font_candidates = [
        # macOS
        ("/System/Library/Fonts/AppleSDGothicNeo.ttc", "AppleSDGothicNeo"),
        # Ubuntu/Debian
        ("/usr/share/fonts/truetype/nanum/NanumGothic.ttf", "NanumGothic"),
        ("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc", "NotoSansCJK"),
        # CentOS/RHEL
        ("/usr/share/fonts/nhn-nanum/NanumGothic.ttf", "NanumGothic"),
    ]

    for font_path, font_name in font_candidates:
        if os.path.exists(font_path):
            try:
                pdfmetrics.registerFont(TTFont(font_name, font_path))
                return font_name
            except Exception:
                continue

    # 폰트를 찾을 수 없는 경우 ReportLab 기본 폰트 사용
    return "Helvetica"


# 모듈 로드 시 한글 폰트 등록
_KOREAN_FONT = _register_korean_font()


def _build_styles(font: str) -> dict:
    """PDF 스타일 정의"""
    return {
        "title": ParagraphStyle(
            "title",
            fontName=font,
            fontSize=20,
            textColor=PRIMARY,
            spaceAfter=4 * mm,
            leading=26,
        ),
        "subtitle": ParagraphStyle(
            "subtitle",
            fontName=font,
            fontSize=12,
            textColor=TEXT_GRAY,
            spaceAfter=8 * mm,
        ),
        "section_header": ParagraphStyle(
            "section_header",
            fontName=font,
            fontSize=13,
            textColor=PRIMARY,
            spaceBefore=6 * mm,
            spaceAfter=3 * mm,
            leading=18,
        ),
        "body": ParagraphStyle(
            "body",
            fontName=font,
            fontSize=10,
            textColor=DARK_GRAY,
            spaceAfter=2 * mm,
            leading=16,
        ),
        "disclaimer": ParagraphStyle(
            "disclaimer",
            fontName=font,
            fontSize=8,
            textColor=TEXT_GRAY,
            spaceAfter=2 * mm,
            leading=13,
            borderColor=DANGER,
            borderPadding=4,
        ),
    }


def generate_consultation_pdf(session_data: dict) -> bytes:
    """
    상담 결과 PDF 생성

    Args:
        session_data: {
            "session_id": str,
            "screening_data": dict,   # chief_complaint, severity, ...
            "diagnosis_result": dict, # primary_department, urgency, reasoning, ...
            "hospital_results": list, # HospitalInfo 목록
            "selected_hospital": dict,
            "created_at": str,        # ISO 8601
        }

    Returns:
        PDF 바이트 (StreamingResponse에 직접 전달 가능)
    """
    buffer = io.BytesIO()
    font = _KOREAN_FONT
    styles = _build_styles(font)

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )

    story = []
    created_at = session_data.get("created_at", datetime.now().isoformat())
    try:
        dt = datetime.fromisoformat(created_at)
        date_str = dt.strftime("%Y년 %m월 %d일 %H:%M")
    except ValueError:
        date_str = created_at

    # ─── 헤더 ──────────────────────────────────────────────────────────────
    story.append(Paragraph("건강상담 결과서", styles["title"]))
    story.append(Paragraph(f"상담 일시: {date_str}", styles["subtitle"]))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY, spaceAfter=6 * mm))

    # ─── 섹션 1: 주요 증상 ──────────────────────────────────────────────────
    screening = session_data.get("screening_data", {})
    if screening:
        story.append(Paragraph("1. 주요 증상", styles["section_header"]))

        screening_table_data = [
            ["항목", "내용"],
            ["주증상", screening.get("chief_complaint", "-")],
            ["발생 부위", screening.get("body_part", "-")],
            ["지속 기간", f"{screening.get('duration_days', '-')}일"],
            ["증상 강도", f"{screening.get('severity', '-')} / 10"],
            ["발생 유형", screening.get("onset_type", "-")],
            ["과거 병력", screening.get("medical_history", "없음")],
            ["복용 약물", screening.get("medications", "없음")],
        ]

        accompanying = screening.get("accompanying_symptoms", [])
        if accompanying:
            screening_table_data.append(["동반 증상", ", ".join(accompanying)])

        table = Table(
            screening_table_data,
            colWidths=[40 * mm, 130 * mm],
        )
        table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), font),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
            ("TEXTCOLOR", (0, 0), (-1, 0), HexColor("#FFFFFF")),
            ("BACKGROUND", (0, 1), (0, -1), LIGHT_GRAY),
            ("FONTNAME", (0, 1), (0, -1), font),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [HexColor("#FFFFFF"), LIGHT_GRAY]),
            ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#DDDDDD")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(table)
        story.append(Spacer(1, 4 * mm))

    # ─── 섹션 2: AI 진료과 추천 ────────────────────────────────────────────
    diagnosis = session_data.get("diagnosis_result", {})
    if diagnosis:
        story.append(Paragraph("2. AI 진료과 추천", styles["section_header"]))

        urgency = diagnosis.get("urgency", "일반")
        urgency_color = {"응급": DANGER, "조기방문권장": ACCENT, "일반": PRIMARY}.get(urgency, PRIMARY)

        diagnosis_table_data = [
            ["구분", "내용"],
            ["1순위 진료과", diagnosis.get("primary_department", "-")],
            ["2순위 진료과", diagnosis.get("secondary_department", "-")],
            ["긴급도", urgency],
            ["추천 근거", diagnosis.get("reasoning", "-")],
        ]

        table = Table(
            diagnosis_table_data,
            colWidths=[40 * mm, 130 * mm],
        )
        table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), font),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
            ("TEXTCOLOR", (0, 0), (-1, 0), HexColor("#FFFFFF")),
            ("BACKGROUND", (0, 1), (0, -1), LIGHT_GRAY),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [HexColor("#FFFFFF"), LIGHT_GRAY]),
            ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#DDDDDD")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            # 긴급도 셀 색상 강조 (row 4 = 긴급도)
            ("TEXTCOLOR", (1, 3), (1, 3), urgency_color),
        ]))
        story.append(table)
        story.append(Spacer(1, 4 * mm))

    # ─── 섹션 3: 추천 병원 ──────────────────────────────────────────────────
    selected = session_data.get("selected_hospital", {})
    hospitals = session_data.get("hospital_results", [])
    display_hospitals = [selected] if selected else hospitals[:3]

    if display_hospitals:
        story.append(Paragraph("3. 추천 병원", styles["section_header"]))

        for idx, hospital in enumerate(display_hospitals, 1):
            story.append(Paragraph(
                f"{idx}. {hospital.get('name', '-')}",
                ParagraphStyle("hospital_name", fontName=font, fontSize=11,
                               textColor=PRIMARY, spaceAfter=1 * mm),
            ))
            story.append(Paragraph(f"주소: {hospital.get('address', '-')}", styles["body"]))
            story.append(Paragraph(f"전화: {hospital.get('phone', '-')}", styles["body"]))
            story.append(Paragraph(f"진료과: {', '.join(hospital.get('departments', []))}", styles["body"]))
            story.append(Paragraph(f"진료시간: {hospital.get('operating_hours', '-')}", styles["body"]))
            if idx < len(display_hospitals):
                story.append(HRFlowable(width="100%", thickness=0.5, color=LIGHT_GRAY, spaceAfter=3 * mm))

        story.append(Spacer(1, 4 * mm))

    # ─── 면책 고지 (필수) ────────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=1, color=DANGER, spaceAfter=3 * mm))
    story.append(Paragraph(
        "⚠️ 의료 면책 고지",
        ParagraphStyle("disclaimer_title", fontName=font, fontSize=11,
                       textColor=DANGER, spaceAfter=2 * mm),
    ))
    disclaimer_text = (
        "본 결과서는 AI가 제공하는 참고용 정보이며, 의사의 진단이나 처방을 대체하지 않습니다. "
        "증상이 지속되거나 악화되는 경우 반드시 의료기관을 방문하여 전문의의 진찰을 받으시기 바랍니다. "
        "응급상황 발생 시 즉시 119에 연락하세요."
    )
    story.append(Paragraph(disclaimer_text, styles["disclaimer"]))

    # 생성일 + 세션 ID
    session_id = session_data.get("session_id", "")
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        f"생성: 건강상담 도우미 | 세션 ID: {session_id[:8]}...",
        ParagraphStyle("footer", fontName=font, fontSize=7, textColor=TEXT_GRAY),
    ))

    doc.build(story)
    buffer.seek(0)
    return buffer.read()
