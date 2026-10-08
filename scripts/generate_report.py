#!/usr/bin/env python3
"""
NANDI Rideshare — Project Audit Report Generator
Produces a professional PDF from audit_data.json
"""

import json, sys, os
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm, cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
from reportlab.platypus.flowables import Flowable
from reportlab.graphics.shapes import Drawing, Rect, String, Line
from reportlab.graphics import renderPDF

# ── Brand colours ────────────────────────────────────────────────────────────
BRAND   = colors.HexColor("#2563EB")   # blue
BRAND_D = colors.HexColor("#1E40AF")
GREEN   = colors.HexColor("#10B981")
RED     = colors.HexColor("#EF4444")
AMBER   = colors.HexColor("#F59E0B")
PURPLE  = colors.HexColor("#8B5CF6")
TEAL    = colors.HexColor("#0EA5E9")
GRAY_90 = colors.HexColor("#111827")
GRAY_60 = colors.HexColor("#6B7280")
GRAY_20 = colors.HexColor("#F3F4F6")
GRAY_10 = colors.HexColor("#F9FAFB")
WHITE   = colors.white
BLACK   = colors.black

SEV_COLOR = {
    "critical": RED,
    "high":     colors.HexColor("#F97316"),
    "medium":   AMBER,
    "low":      GREEN,
}
PRI_COLOR = {
    "high":   BRAND,
    "medium": PURPLE,
    "low":    GRAY_60,
}
EFFORT_COLOR = {
    "small":  GREEN,
    "medium": AMBER,
    "large":  colors.HexColor("#F97316"),
}

W, H = A4
MARGIN = 18 * mm
CONTENT_W = W - 2 * MARGIN

# ── Styles ────────────────────────────────────────────────────────────────────
base = getSampleStyleSheet()

def make_style(name, **kw):
    s = ParagraphStyle(name, **kw)
    return s

H1 = make_style("H1", fontSize=26, leading=32, textColor=WHITE,
                fontName="Helvetica-Bold", alignment=TA_LEFT)
H2 = make_style("H2", fontSize=15, leading=20, textColor=BRAND_D,
                fontName="Helvetica-Bold", spaceAfter=4)
H3 = make_style("H3", fontSize=11, leading=14, textColor=GRAY_90,
                fontName="Helvetica-Bold", spaceAfter=2)
BODY = make_style("BODY", fontSize=9, leading=13, textColor=GRAY_90,
                  fontName="Helvetica", spaceAfter=2)
BODY_SM = make_style("BODY_SM", fontSize=8, leading=11, textColor=GRAY_60,
                     fontName="Helvetica")
MONO = make_style("MONO", fontSize=7.5, leading=10, textColor=BRAND_D,
                  fontName="Courier", backColor=GRAY_10)
LABEL = make_style("LABEL", fontSize=7, leading=9, textColor=WHITE,
                   fontName="Helvetica-Bold", alignment=TA_CENTER)
SECTION_TITLE = make_style("SECTION_TITLE", fontSize=13, leading=17,
                            textColor=WHITE, fontName="Helvetica-Bold")
TOC_ITEM = make_style("TOC_ITEM", fontSize=9.5, leading=13, textColor=BRAND,
                      fontName="Helvetica", leftIndent=8)
CAPTION = make_style("CAPTION", fontSize=8, leading=11, textColor=GRAY_60,
                     fontName="Helvetica-Oblique", alignment=TA_CENTER)

# ── Custom Flowables ──────────────────────────────────────────────────────────

class SectionHeader(Flowable):
    """Full-width colour banner for section headings."""
    def __init__(self, title, subtitle="", color=BRAND, width=CONTENT_W):
        super().__init__()
        self._title    = title
        self._subtitle = subtitle
        self._color    = color
        self.width     = width
        self.height    = 36 if subtitle else 28

    def draw(self):
        c = self.canv
        c.setFillColor(self._color)
        c.roundRect(0, 0, self.width, self.height, 6, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 13)
        y = self.height - 18 if self._subtitle else (self.height - 13) / 2 + 2
        c.drawString(12, y, self._title)
        if self._subtitle:
            c.setFont("Helvetica", 8)
            c.setFillColor(colors.HexColor("#DBEAFE"))
            c.drawString(12, 8, self._subtitle)


class Badge(Flowable):
    """Small coloured pill badge (severity / priority)."""
    def __init__(self, text, color=BRAND, text_color=WHITE, w=None):
        super().__init__()
        self._text  = text.upper()
        self._color = color
        self._tc    = text_color
        self.width  = w or (len(text) * 5.5 + 14)
        self.height = 13

    def draw(self):
        c = self.canv
        c.setFillColor(self._color)
        c.roundRect(0, 0, self.width, self.height, 4, fill=1, stroke=0)
        c.setFillColor(self._tc)
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(self.width / 2, 3.5, self._text)


class HLine(Flowable):
    def __init__(self, width=CONTENT_W, color=GRAY_20, thickness=0.5):
        super().__init__()
        self.width  = width
        self._color = color
        self._thick = thickness
        self.height = self._thick

    def draw(self):
        self.canv.setStrokeColor(self._color)
        self.canv.setLineWidth(self._thick)
        self.canv.line(0, 0, self.width, 0)


# ── Page template ─────────────────────────────────────────────────────────────

def on_page(canvas, doc):
    """Header + footer on every page."""
    canvas.saveState()
    # top stripe
    canvas.setFillColor(BRAND)
    canvas.rect(0, H - 10*mm, W, 10*mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(MARGIN, H - 6.5*mm, "NANDI RIDESHARE  ·  PROJECT AUDIT REPORT  ·  CONFIDENTIAL")
    canvas.setFont("Helvetica", 7.5)
    canvas.drawRightString(W - MARGIN, H - 6.5*mm, datetime.now().strftime("%B %d, %Y"))
    # bottom stripe
    canvas.setFillColor(GRAY_20)
    canvas.rect(0, 0, W, 8*mm, fill=1, stroke=0)
    canvas.setFillColor(GRAY_60)
    canvas.setFont("Helvetica", 7)
    canvas.drawString(MARGIN, 2.8*mm, "© 2026 NANDI · Internal Use Only")
    canvas.drawRightString(W - MARGIN, 2.8*mm, f"Page {doc.page}")
    canvas.restoreState()


# ── Cover page ────────────────────────────────────────────────────────────────

def cover_page(data):
    story = []
    story.append(Spacer(1, 28*mm))

    # Hero block
    logo_tbl = Table([[
        Paragraph("<font color='white' size='28'><b>NANDI</b></font>", BODY),
    ]], colWidths=[CONTENT_W])
    logo_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), BRAND),
        ("ROUNDEDCORNERS", (0,0), (-1,-1), [10,10,10,10]),
        ("TOPPADDING",    (0,0), (-1,-1), 22),
        ("BOTTOMPADDING", (0,0), (-1,-1), 22),
        ("LEFTPADDING",   (0,0), (-1,-1), 24),
        ("ALIGN",         (0,0), (-1,-1), "LEFT"),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(logo_tbl)
    story.append(Spacer(1, 6*mm))

    tagline = make_style("TL", fontSize=11, leading=15, textColor=GRAY_60,
                         fontName="Helvetica-Oblique")
    story.append(Paragraph("Reliable. Shared. Safe.", tagline))
    story.append(Spacer(1, 12*mm))

    title_style = make_style("CT", fontSize=22, leading=28, textColor=GRAY_90,
                             fontName="Helvetica-Bold")
    story.append(Paragraph("Project Audit Report", title_style))
    sub_style = make_style("CS", fontSize=13, leading=18, textColor=GRAY_60,
                           fontName="Helvetica")
    story.append(Paragraph("Full-Stack Security · Bug Analysis · Performance · Roadmap", sub_style))
    story.append(Spacer(1, 10*mm))
    story.append(HLine(color=BRAND, thickness=2))
    story.append(Spacer(1, 8*mm))

    # Summary scorecard
    s = data.get("summary", {})
    total    = s.get("totalIssues", 0)
    critical = s.get("critical", 0)
    high     = s.get("high", 0)
    medium   = s.get("medium", 0)
    low      = s.get("low", 0)

    card_data = [
        ["TOTAL ISSUES", "CRITICAL", "HIGH", "MEDIUM", "LOW"],
        [str(total), str(critical), str(high), str(medium), str(low)],
    ]
    card_colors = [BRAND, RED, colors.HexColor("#F97316"), AMBER, GREEN]
    tbl = Table(card_data, colWidths=[CONTENT_W/5]*5, rowHeights=[18, 28])
    style = TableStyle([
        ("ALIGN",       (0,0), (-1,-1), "CENTER"),
        ("VALIGN",      (0,0), (-1,-1), "MIDDLE"),
        ("FONTNAME",    (0,0), (-1,0),  "Helvetica-Bold"),
        ("FONTSIZE",    (0,0), (-1,0),  7),
        ("FONTNAME",    (0,1), (-1,1),  "Helvetica-Bold"),
        ("FONTSIZE",    (0,1), (-1,1),  18),
        ("TOPPADDING",  (0,0), (-1,-1), 4),
        ("BOTTOMPADDING",(0,0),(-1,-1), 4),
        ("ROUNDEDCORNERS",(0,0),(-1,-1),[6,6,6,6]),
    ])
    for i, col in enumerate(card_colors):
        style.add("BACKGROUND", (i,0), (i,-1), col)
        style.add("TEXTCOLOR",  (i,0), (i,-1), WHITE)
    tbl.setStyle(style)
    story.append(tbl)
    story.append(Spacer(1, 8*mm))

    # Meta info table
    meta = [
        ["Generated",  datetime.now().strftime("%B %d, %Y  %H:%M")],
        ["App",        "NANDI Rideshare (Expo SDK 54 + tRPC + Drizzle/MySQL)"],
        ["Scope",      "Full-stack: Server, Client (React Native/Web), DB schema, Infra"],
        ["Auditor",    "Claude Sonnet 4.6 — Automated Static Analysis"],
    ]
    mt = Table(meta, colWidths=[38*mm, CONTENT_W - 38*mm])
    mt.setStyle(TableStyle([
        ("FONTNAME",   (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTNAME",   (1,0), (1,-1), "Helvetica"),
        ("FONTSIZE",   (0,0), (-1,-1), 8.5),
        ("TEXTCOLOR",  (0,0), (0,-1),  GRAY_60),
        ("TEXTCOLOR",  (1,0), (1,-1),  GRAY_90),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING",(0,0),(-1,-1),4),
        ("LINEBELOW",  (0,0), (-1,-2), 0.4, GRAY_20),
    ]))
    story.append(mt)
    story.append(Spacer(1, 8*mm))

    # Top priorities box
    top = s.get("topPriority", [])
    if top:
        story.append(Paragraph("Top Priority Actions", H2))
        for i, t in enumerate(top[:6], 1):
            story.append(Paragraph(f"{i}. {t}", BODY))
    story.append(PageBreak())
    return story


# ── Table of contents ─────────────────────────────────────────────────────────

def toc_page():
    story = [SectionHeader("TABLE OF CONTENTS", color=BRAND_D), Spacer(1, 6*mm)]
    sections = [
        ("1", "Executive Summary",          "Security overview and risk posture"),
        ("2", "Security Findings",           "Auth, API, SQL, secrets, Stripe"),
        ("3", "Critical Bugs & Runtime Errors","Crashes, data loss, race conditions"),
        ("4", "TypeScript & Type Safety",    "Type gaps, unsafe casts, unhandled promises"),
        ("5", "Performance Issues",          "N+1 queries, polling, bundle size"),
        ("6", "Incomplete Implementations", "TODOs, stubs, unfinished flows"),
        ("7", "Infrastructure & Config",     "Redis, env vars, Google Maps, push"),
        ("8", "Advanced Feature Roadmap",    "Prioritised suggestions for v2+"),
        ("9", "Appendix",                    "File manifest, tech stack"),
    ]
    for num, title, sub in sections:
        row = [
            Paragraph(f"<b>{num}</b>", BODY),
            Paragraph(f"<b>{title}</b><br/><font color='#6B7280' size='8'>{sub}</font>", BODY),
        ]
        t = Table([row], colWidths=[12*mm, CONTENT_W - 12*mm])
        t.setStyle(TableStyle([
            ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
            ("TOPPADDING",    (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("LINEBELOW",     (0,0), (-1,-1), 0.4, GRAY_20),
        ]))
        story.append(t)
    story.append(PageBreak())
    return story


# ── Issue card ────────────────────────────────────────────────────────────────

def issue_card(item, sev_key="severity"):
    sev   = item.get(sev_key, "low")
    color = SEV_COLOR.get(sev, GRAY_60)
    title = item.get("title", "—")
    loc   = item.get("location", "")
    detail= item.get("detail", "")
    fix   = item.get("fix", "")
    effort= item.get("effort", "")
    pri   = item.get("priority", "")

    badge_color = PRI_COLOR.get(pri, color) if pri else color
    badge_text  = pri if pri else sev

    rows = []
    # Header row
    header_row = [
        Paragraph(f"<b>{title}</b>", H3),
        Paragraph(f"<font color='#6B7280' size='7.5'>{loc}</font>",
                  make_style("LOC", fontSize=7.5, leading=10, textColor=GRAY_60,
                             fontName="Courier", alignment=TA_RIGHT)),
    ]
    rows.append(header_row)

    if detail:
        rows.append([Paragraph(detail, BODY), ""])
    if fix:
        rows.append([
            Paragraph(f"<b>Fix:</b> {fix}",
                      make_style("FIX", fontSize=8.5, leading=12, textColor=GREEN,
                                 fontName="Helvetica")),
            "",
        ])
    if effort:
        rows.append([
            Paragraph(f"Effort: <b>{effort.title()}</b>",
                      make_style("EFF", fontSize=8, leading=11, textColor=GRAY_60,
                                 fontName="Helvetica")),
            "",
        ])

    col_w = [CONTENT_W - 30*mm, 30*mm]
    tbl = Table(rows, colWidths=col_w)
    ts = TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), WHITE),
        ("LINEAFTER",     (0,0), (0,-1), 3, color),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("LEFTPADDING",   (0,0), (0,-1), 10),
        ("LEFTPADDING",   (1,0), (1,-1), 4),
        ("RIGHTPADDING",  (0,0), (-1,-1), 6),
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("SPAN",          (0,1), (1,1)) if len(rows) > 1 else ("TOPPADDING",(0,0),(-1,-1),5),
        ("BOX",           (0,0), (-1,-1), 0.4, colors.HexColor("#E5E7EB")),
        ("ROUNDEDCORNERS",(0,0), (-1,-1), [4,4,4,4]),
    ])
    # Span detail/fix/effort rows across both columns
    for i in range(1, len(rows)):
        ts.add("SPAN", (0,i), (1,i))
    tbl.setStyle(ts)
    return KeepTogether([tbl, Spacer(1, 3*mm)])


# ── Section builder ───────────────────────────────────────────────────────────

def section(story, title, subtitle, color, items, sev_key="severity"):
    story.append(SectionHeader(title, subtitle, color=color))
    story.append(Spacer(1, 4*mm))
    if not items:
        story.append(Paragraph("No issues found in this category.", BODY_SM))
    else:
        # Sort by severity
        order = {"critical":0,"high":1,"medium":2,"low":3,"":4}
        items = sorted(items, key=lambda x: order.get(x.get(sev_key,""),4))
        for item in items:
            story.append(issue_card(item, sev_key))
    story.append(Spacer(1, 4*mm))


# ── Advanced features section ─────────────────────────────────────────────────

def features_section(story, features):
    story.append(SectionHeader("8  ADVANCED FEATURE ROADMAP",
                               "Prioritised suggestions for v2+", color=PURPLE))
    story.append(Spacer(1, 4*mm))
    if not features:
        story.append(Paragraph("No suggestions recorded.", BODY_SM))
        return

    order = {"high":0,"medium":1,"low":2}
    features = sorted(features, key=lambda x: order.get(x.get("priority","low"),2))

    for f in features:
        pri    = f.get("priority","medium")
        effort = f.get("effort","medium")
        title  = f.get("title","")
        detail = f.get("detail","")

        p_badge  = PRI_COLOR.get(pri, GRAY_60)
        e_badge  = EFFORT_COLOR.get(effort, GRAY_60)

        badges = Table([[
            Paragraph(f"<font color='white' size='6.5'><b>{pri.upper()}</b></font>", BODY),
            Paragraph(f"<font color='white' size='6.5'><b>EFFORT: {effort.upper()}</b></font>", BODY),
        ]], colWidths=[22*mm, 32*mm], rowHeights=[13])
        badges.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (0,-1), p_badge),
            ("BACKGROUND", (1,0), (1,-1), e_badge),
            ("ALIGN",      (0,0), (-1,-1), "CENTER"),
            ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
            ("FONTNAME",   (0,0), (-1,-1), "Helvetica-Bold"),
            ("TOPPADDING", (0,0), (-1,-1), 2),
            ("BOTTOMPADDING",(0,0),(-1,-1),2),
            ("ROUNDEDCORNERS",(0,0),(-1,-1),[3,3,3,3]),
        ]))

        content = [
            [Paragraph(f"<b>{title}</b>", H3), badges],
            [Paragraph(detail, BODY), ""],
        ]
        t = Table(content, colWidths=[CONTENT_W - 58*mm, 58*mm])
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,-1), WHITE),
            ("LINEAFTER",     (0,0), (0,-1), 3, p_badge),
            ("TOPPADDING",    (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("LEFTPADDING",   (0,0), (0,-1), 10),
            ("RIGHTPADDING",  (0,0), (-1,-1), 6),
            ("VALIGN",        (0,0), (-1,-1), "TOP"),
            ("SPAN",          (0,1), (1,1)),
            ("BOX",           (0,0), (-1,-1), 0.4, GRAY_20),
            ("ROUNDEDCORNERS",(0,0), (-1,-1), [4,4,4,4]),
        ]))
        story.append(KeepTogether([t, Spacer(1, 3*mm)]))
    story.append(Spacer(1, 4*mm))


# ── Appendix ──────────────────────────────────────────────────────────────────

def appendix(story):
    story.append(PageBreak())
    story.append(SectionHeader("9  APPENDIX", "Tech stack & file manifest", color=TEAL))
    story.append(Spacer(1, 4*mm))

    stack = [
        ["Layer",           "Technology",                   "Version"],
        ["Mobile/Web UI",   "React Native + Expo",          "SDK 54"],
        ["Navigation",      "Expo Router (file-based)",     "~6.0"],
        ["State",           "React Context + AsyncStorage", "—"],
        ["API",             "tRPC + Zod",                   "11.7"],
        ["Server",          "Node.js + Express",            "20.x"],
        ["Database",        "MySQL + Drizzle ORM",          "^0.44"],
        ["Auth",            "JWT + Secure Cookie",          "—"],
        ["Payments",        "Stripe Connect",               "latest"],
        ["Push",            "Expo Push (expo-server-sdk)",  "^6.1"],
        ["Maps",            "OSRM / Google Maps fallback",  "—"],
        ["Realtime",        "SSE + WebSocket (ws)",         "—"],
        ["Cache",           "Redis (in-memory fallback)",   "—"],
        ["Monitoring",      "Sentry",                       "^8.8"],
    ]
    col_w = [42*mm, CONTENT_W - 90*mm, 44*mm]
    t = Table(stack, colWidths=col_w)
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), BRAND),
        ("TEXTCOLOR",     (0,0), (-1,0), WHITE),
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,-1), 8.5),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [WHITE, GRAY_10]),
        ("GRID",          (0,0), (-1,-1), 0.4, GRAY_20),
        ("TOPPADDING",    (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
    ]))
    story.append(t)
    story.append(Spacer(1, 6*mm))

    story.append(Paragraph("Key Server Files", H2))
    files = [
        "server/_core/index.ts       — Express app, tRPC mount, rate-limiter, SSE",
        "server/routers.ts           — All tRPC procedures (rides, driver, stripe, etc.)",
        "server/db.ts                — Drizzle queries + atomicTransitionRideStep",
        "server/services/driverMatcher.ts — Dispatch queue, candidate scoring",
        "server/services/fareEngine.ts    — Fare calculation + surge",
        "server/services/rideStateMachine.ts — State graph + atomic transitions",
        "server/services/stripe.ts        — Stripe Connect charges",
        "server/services/websocket.ts     — WS server for driver GPS broadcast",
        "drizzle/schema.ts           — MySQL table definitions + indexes",
    ]
    for f in files:
        story.append(Paragraph(f"<font face='Courier' size='7.5'>{f}</font>", BODY))

    story.append(Spacer(1, 4*mm))
    story.append(Paragraph("Key Client Files", H2))
    cfiles = [
        "app/(tabs)/index.tsx        — Home screen",
        "app/book-ride.tsx           — Location + mode selection",
        "app/confirm-ride.tsx        — Booking confirmation + payment",
        "app/active-ride.tsx         — Live ride tracking (passenger)",
        "app/driver-mode.tsx         — Driver dashboard + lifecycle",
        "app/rate-ride.tsx           — Post-ride rating screen",
        "app/emergency-sos.tsx       — SOS + emergency contacts",
        "lib/rides-store.tsx         — Global ride state (Context + AsyncStorage)",
        "lib/trpc.ts                 — tRPC client setup",
    ]
    for f in cfiles:
        story.append(Paragraph(f"<font face='Courier' size='7.5'>{f}</font>", BODY))


# ── Main ──────────────────────────────────────────────────────────────────────

def build_pdf(data_path, out_path):
    with open(data_path) as f:
        data = json.load(f)

    doc = SimpleDocTemplate(
        out_path,
        pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=14*mm, bottomMargin=12*mm,
        title="NANDI Rideshare — Project Audit Report",
        author="Claude Sonnet 4.6",
        subject="Full-Stack Security · Bug Analysis · Performance · Roadmap",
    )

    story = []

    # 1. Cover
    story += cover_page(data)

    # 2. TOC
    story += toc_page()

    # 3. Security
    story.append(SectionHeader("2  SECURITY FINDINGS",
                               "Authentication · API Guards · SQL · Secrets · Stripe",
                               color=RED))
    story.append(Spacer(1,4*mm))
    sec = data.get("security", [])
    if not sec:
        story.append(Paragraph("No security issues found.", BODY_SM))
    else:
        order = {"critical":0,"high":1,"medium":2,"low":3}
        for item in sorted(sec, key=lambda x: order.get(x.get("severity","low"),4)):
            story.append(issue_card(item))
    story.append(PageBreak())

    # 4. Bugs
    story.append(SectionHeader("3  CRITICAL BUGS & RUNTIME ERRORS",
                               "Crashes · Data Loss · Race Conditions · Null Dereferences",
                               color=colors.HexColor("#F97316")))
    story.append(Spacer(1,4*mm))
    bugs = data.get("bugs", [])
    if not bugs:
        story.append(Paragraph("No critical bugs found.", BODY_SM))
    else:
        order = {"critical":0,"high":1,"medium":2,"low":3}
        for item in sorted(bugs, key=lambda x: order.get(x.get("severity","low"),4)):
            story.append(issue_card(item))
    story.append(PageBreak())

    # 5. TypeScript
    story.append(SectionHeader("4  TYPESCRIPT & TYPE SAFETY",
                               "Unsafe Casts · Unhandled Promises · Missing Types",
                               color=PURPLE))
    story.append(Spacer(1,4*mm))
    ts = data.get("typescript", [])
    if not ts:
        story.append(Paragraph("No TypeScript issues found.", BODY_SM))
    else:
        order = {"high":0,"medium":1,"low":2}
        for item in sorted(ts, key=lambda x: order.get(x.get("severity","low"),4)):
            story.append(issue_card(item))
    story.append(PageBreak())

    # 6. Performance
    story.append(SectionHeader("5  PERFORMANCE ISSUES",
                               "N+1 Queries · Polling · Bundle Size · DB Indexes",
                               color=AMBER))
    story.append(Spacer(1,4*mm))
    perf = data.get("performance", [])
    if not perf:
        story.append(Paragraph("No performance issues found.", BODY_SM))
    else:
        order = {"high":0,"medium":1,"low":2}
        for item in sorted(perf, key=lambda x: order.get(x.get("severity","low"),4)):
            story.append(issue_card(item))
    story.append(PageBreak())

    # 7. Incomplete
    story.append(SectionHeader("6  INCOMPLETE IMPLEMENTATIONS",
                               "TODOs · Mock Data · Unfinished Flows",
                               color=TEAL))
    story.append(Spacer(1,4*mm))
    inc = data.get("incomplete", [])
    if not inc:
        story.append(Paragraph("No incomplete implementations found.", BODY_SM))
    else:
        for item in inc:
            story.append(issue_card(item, sev_key="severity"))
    story.append(PageBreak())

    # 8. Infrastructure
    story.append(SectionHeader("7  INFRASTRUCTURE & CONFIG",
                               "Redis · Env Vars · Google Maps · Push Notifications",
                               color=GREEN))
    story.append(Spacer(1,4*mm))
    infra = data.get("infrastructure", [])
    if not infra:
        story.append(Paragraph("No infrastructure issues found.", BODY_SM))
    else:
        order = {"high":0,"medium":1,"low":2}
        for item in sorted(infra, key=lambda x: order.get(x.get("severity","low"),4)):
            story.append(issue_card(item))
    story.append(PageBreak())

    # 9. Features
    features_section(story, data.get("advanced_features", []))
    story.append(PageBreak())

    # 10. Appendix
    appendix(story)

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f"✅  Report written → {out_path}")


if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_path = os.path.join(base_dir, "audit_data.json")
    out_path  = os.path.join(base_dir, "PROJECT_AUDIT_REPORT.pdf")
    build_pdf(data_path, out_path)
