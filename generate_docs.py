#!/usr/bin/env python3
"""Generate RideShare App Technical Documentation PDF — 10 pages."""

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    HRFlowable, KeepTogether,
)
from reportlab.lib import colors
import os

OUTPUT = "/Users/rajtharun/Downloads/RideShare_Documentation.pdf"

# ─── Colors ──────────────────────────────────────────────────────────────────

BRAND      = HexColor("#6C63FF")
BRAND_DARK = HexColor("#4A42D4")
ACCENT     = HexColor("#00C9A7")
BG_LIGHT   = HexColor("#F7F7FC")
TEXT_DARK   = HexColor("#1A1A2E")
TEXT_MED    = HexColor("#4A4A68")
CRITICAL   = HexColor("#E53E3E")
HIGH       = HexColor("#DD6B20")
MEDIUM     = HexColor("#D69E2E")
LOW        = HexColor("#38A169")
FIXED      = HexColor("#38A169")

# ─── Styles ──────────────────────────────────────────────────────────────────

styles = getSampleStyleSheet()

styles.add(ParagraphStyle("CoverTitle", parent=styles["Title"],
    fontSize=36, leading=44, textColor=BRAND, alignment=TA_CENTER,
    spaceAfter=8, fontName="Helvetica-Bold"))

styles.add(ParagraphStyle("CoverSubtitle", parent=styles["Normal"],
    fontSize=16, leading=22, textColor=TEXT_MED, alignment=TA_CENTER,
    spaceAfter=6))

styles.add(ParagraphStyle("CoverDate", parent=styles["Normal"],
    fontSize=12, leading=16, textColor=TEXT_MED, alignment=TA_CENTER,
    spaceAfter=40))

styles.add(ParagraphStyle("H1", parent=styles["Heading1"],
    fontSize=22, leading=28, textColor=BRAND_DARK, spaceAfter=12,
    spaceBefore=20, fontName="Helvetica-Bold"))

styles.add(ParagraphStyle("H2", parent=styles["Heading2"],
    fontSize=16, leading=22, textColor=TEXT_DARK, spaceAfter=8,
    spaceBefore=14, fontName="Helvetica-Bold"))

styles.add(ParagraphStyle("H3", parent=styles["Heading3"],
    fontSize=13, leading=18, textColor=BRAND, spaceAfter=6,
    spaceBefore=10, fontName="Helvetica-Bold"))

styles.add(ParagraphStyle("Body", parent=styles["Normal"],
    fontSize=10.5, leading=15, textColor=TEXT_DARK, alignment=TA_JUSTIFY,
    spaceAfter=8))

styles.add(ParagraphStyle("BodySmall", parent=styles["Normal"],
    fontSize=9.5, leading=13, textColor=TEXT_MED, spaceAfter=4))

styles.add(ParagraphStyle("BulletCustom", parent=styles["Normal"],
    fontSize=10.5, leading=15, textColor=TEXT_DARK, leftIndent=20,
    bulletIndent=10, spaceAfter=4))

styles.add(ParagraphStyle("CodeBlock", parent=styles["Normal"],
    fontSize=9, leading=12, fontName="Courier", textColor=HexColor("#2D3748"),
    backColor=HexColor("#EDF2F7"), leftIndent=12, rightIndent=12,
    spaceBefore=4, spaceAfter=4, borderPadding=6))

styles.add(ParagraphStyle("TableCell", parent=styles["Normal"],
    fontSize=9, leading=12, textColor=TEXT_DARK))

styles.add(ParagraphStyle("TableHeader", parent=styles["Normal"],
    fontSize=9, leading=12, textColor=white, fontName="Helvetica-Bold"))

styles.add(ParagraphStyle("Footer", parent=styles["Normal"],
    fontSize=8, leading=10, textColor=TEXT_MED, alignment=TA_CENTER))

styles.add(ParagraphStyle("TOCEntry", parent=styles["Normal"],
    fontSize=12, leading=20, textColor=TEXT_DARK, leftIndent=20))

styles.add(ParagraphStyle("TOCSection", parent=styles["Normal"],
    fontSize=13, leading=22, textColor=BRAND_DARK, fontName="Helvetica-Bold",
    leftIndent=10, spaceBefore=6))

# ─── Helpers ─────────────────────────────────────────────────────────────────

def hr():
    return HRFlowable(width="100%", thickness=1, color=HexColor("#E2E8F0"),
                      spaceBefore=8, spaceAfter=8)

def badge(text, color):
    return f'<font color="{color.hexval()}">[{text}]</font>'

def make_table(headers, rows, col_widths=None):
    """Create a styled table."""
    header_row = [Paragraph(h, styles["TableHeader"]) for h in headers]
    data = [header_row]
    for row in rows:
        data.append([Paragraph(str(c), styles["TableCell"]) for c in row])

    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BACKGROUND", (0, 1), (-1, -1), white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, BG_LIGHT]),
        ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#E2E8F0")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 1), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
    ]))
    return t

# ─── Page number callback ───────────────────────────────────────────────────

def add_page_number(canvas_obj, doc):
    page_num = canvas_obj.getPageNumber()
    if page_num > 1:  # skip cover
        canvas_obj.saveState()
        canvas_obj.setFont("Helvetica", 8)
        canvas_obj.setFillColor(TEXT_MED)
        canvas_obj.drawCentredString(letter[0] / 2, 30,
            f"RideShare Technical Documentation  |  Page {page_num} of 10")
        # top line
        canvas_obj.setStrokeColor(HexColor("#E2E8F0"))
        canvas_obj.setLineWidth(0.5)
        canvas_obj.line(60, letter[1] - 50, letter[0] - 60, letter[1] - 50)
        canvas_obj.restoreState()

# ─── Build Document ──────────────────────────────────────────────────────────

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=letter,
    topMargin=0.8*inch,
    bottomMargin=0.7*inch,
    leftMargin=0.9*inch,
    rightMargin=0.9*inch,
    title="RideShare - Technical Documentation",
    author="Engineering Team",
    subject="Complete technical audit, architecture, and fixes documentation",
)

story = []

# ═══════════════════════════════════════════════════════════════════════════════
# PAGE 1 — COVER
# ═══════════════════════════════════════════════════════════════════════════════

story.append(Spacer(1, 2.2*inch))
story.append(Paragraph("RideShare", styles["CoverTitle"]))
story.append(Spacer(1, 8))
story.append(Paragraph("Technical Documentation &amp; Audit Report", styles["CoverSubtitle"]))
story.append(Spacer(1, 6))
story.append(HRFlowable(width="40%", thickness=3, color=BRAND,
                         spaceBefore=12, spaceAfter=12, hAlign="CENTER"))
story.append(Spacer(1, 6))
story.append(Paragraph("Full-Stack Rideshare Application", styles["CoverSubtitle"]))
story.append(Paragraph("Expo + React Native  |  tRPC v11  |  Drizzle ORM  |  MySQL", styles["BodySmall"]))
story.append(Spacer(1, 30))
story.append(Paragraph("Version 1.0  |  March 2026", styles["CoverDate"]))
story.append(Paragraph("Prepared by: Engineering Team", styles["CoverDate"]))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# PAGE 2 — TABLE OF CONTENTS
# ═══════════════════════════════════════════════════════════════════════════════

story.append(Paragraph("Table of Contents", styles["H1"]))
story.append(hr())

toc_items = [
    ("1", "Architecture Overview", "3"),
    ("2", "Technology Stack", "3"),
    ("3", "Project Structure", "4"),
    ("4", "Core Features", "5"),
    ("5", "Server Architecture", "5"),
    ("6", "Database Schema", "6"),
    ("7", "Authentication Flow", "6"),
    ("8", "Real-Time System (SSE)", "7"),
    ("9", "Audit Findings &amp; Fixes", "7-8"),
    ("10", "Severity Breakdown", "9"),
    ("11", "Remaining Risks &amp; Recommendations", "10"),
]

for num, title, page in toc_items:
    story.append(Paragraph(
        f'<font color="{BRAND.hexval()}" name="Helvetica-Bold"><b>{num}.</b></font>'
        f'&nbsp;&nbsp;{title}'
        f'<font color="{TEXT_MED.hexval()}"> {"." * (60 - len(title))} {page}</font>',
        styles["TOCEntry"]))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# PAGE 3 — ARCHITECTURE OVERVIEW + TECH STACK
# ═══════════════════════════════════════════════════════════════════════════════

story.append(Paragraph("1. Architecture Overview", styles["H1"]))
story.append(Paragraph(
    "RideShare is a full-stack rideshare platform built with a modern TypeScript-first approach. "
    "The application supports both solo and shared rides, real-time driver tracking, carpooling, "
    "in-app payments, chat, emergency SOS, and a driver matching engine with geographic scoring.",
    styles["Body"]))

story.append(Paragraph(
    "The system follows a monorepo architecture with the frontend (Expo/React Native) and backend "
    "(Express + tRPC) co-located. The backend exposes a type-safe API via tRPC v11, with real-time "
    "event delivery through Server-Sent Events (SSE). All database operations use Drizzle ORM "
    "with MySQL as the backing store.",
    styles["Body"]))

# Architecture diagram as table
arch_data = [
    ["Layer", "Technology", "Purpose"],
    ["Frontend", "Expo + React Native (Web/iOS/Android)", "Cross-platform UI with file-based routing"],
    ["API Layer", "tRPC v11 + Express.js", "Type-safe RPC with React Query integration"],
    ["Real-Time", "Server-Sent Events (SSE)", "Live ride updates, driver tracking, notifications"],
    ["ORM", "Drizzle ORM", "Type-safe SQL with migrations"],
    ["Database", "MySQL 8.0", "Relational data store with connection pooling"],
    ["Auth", "Jose JWT + HTTP-only cookies", "Secure session management with OTP verification"],
    ["Maps", "Google Maps API + OSRM", "Geocoding, directions, polyline route matching"],
    ["Push", "Expo Push Notifications", "FCM/APNs via Expo's push API"],
    ["SMS", "Twilio", "Critical alerts (SOS, driver arrived)"],
]

story.append(Spacer(1, 10))
story.append(make_table(arch_data[0], arch_data[1:], col_widths=[1.1*inch, 2.6*inch, 3.0*inch]))

story.append(Spacer(1, 16))
story.append(Paragraph("2. Technology Stack", styles["H1"]))

stack_data = [
    ["Category", "Package", "Version"],
    ["Runtime", "Node.js + tsx watch", "ES2022 target"],
    ["Framework", "Expo SDK + expo-router v4", "~52.x"],
    ["API", "@trpc/server, @trpc/client, @trpc/react-query", "v11 (next)"],
    ["Database", "drizzle-orm + mysql2", "0.38.x"],
    ["Auth", "jose (JWT)", "v5.x"],
    ["State", "@tanstack/react-query", "v5"],
    ["Animations", "react-native-reanimated", "v3"],
    ["Maps", "@react-native-google-maps", "via expo"],
    ["Validation", "zod", "v3.23"],
]

story.append(make_table(stack_data[0], stack_data[1:], col_widths=[1.3*inch, 3.2*inch, 2.2*inch]))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# PAGE 4 — PROJECT STRUCTURE
# ═══════════════════════════════════════════════════════════════════════════════

story.append(Paragraph("3. Project Structure", styles["H1"]))
story.append(Paragraph(
    "The project uses Expo's file-based routing with a clean separation between frontend screens, "
    "shared libraries, server-side logic, and database schema definitions.",
    styles["Body"]))

dirs = [
    ["Directory", "Contents", "Key Files"],
    ["app/", "Expo Router screens (file-based routing)", "_layout.tsx, (tabs)/, auth/, book-ride.tsx, active-ride.tsx"],
    ["app/(tabs)/", "Tab navigator screens", "index.tsx, rides.tsx, profile.tsx"],
    ["app/auth/", "Authentication flow", "sign-in-v2.tsx, sign-up.tsx, verify-otp.tsx"],
    ["components/", "Reusable UI components", "AppLoadingScreen.tsx, GoogleMapView.tsx, RouteMapView.tsx, StopsList.tsx"],
    ["lib/", "Frontend utilities and providers", "auth-context-v2.tsx, trpc.ts, theme-provider.tsx, utils.ts"],
    ["server/", "Backend Express + tRPC server", "routers.ts (~2900 lines), db.ts (~1500 lines)"],
    ["server/_core/", "Server infrastructure", "index.ts (entry), context.ts, sdk.ts, env.ts, oauth.ts"],
    ["server/services/", "Business logic services", "driverMatcher.ts, fareEngine.ts, rideStateMachine.ts, notificationService.ts"],
    ["drizzle/", "Database schema and migrations", "schema.ts, relations.ts, 0001-0003 SQL migrations"],
    ["tests/", "Test files", "auth.logout.test.ts"],
]

story.append(make_table(dirs[0], dirs[1:], col_widths=[1.3*inch, 2.4*inch, 3.0*inch]))

story.append(Spacer(1, 16))
story.append(Paragraph("Key File Sizes (Lines of Code)", styles["H2"]))

loc_data = [
    ["File", "Lines", "Role"],
    ["server/routers.ts", "~2,900", "All tRPC API endpoints (ride, wallet, chat, driver, carpool, etc.)"],
    ["server/db.ts", "~1,500", "Database access layer with all CRUD operations"],
    ["drizzle/schema.ts", "~450", "All table definitions (20+ tables)"],
    ["server/services/driverMatcher.ts", "~270", "Dispatch queue + driver scoring algorithm"],
    ["server/services/notificationService.ts", "~260", "SSE, push notifications, SMS delivery"],
    ["server/services/stopManager.ts", "~375", "Multi-passenger stop ordering with polyline matching"],
    ["server/services/fareEngine.ts", "~200", "Fare calculation with surge, promo, distance-based pricing"],
    ["app/_layout.tsx", "~250", "Root layout with auth guard + post-login splash"],
    ["lib/auth-context-v2.tsx", "~300", "Auth context provider with OTP flow"],
    ["components/AppLoadingScreen.tsx", "~280", "Animated loading/splash screen component"],
]

story.append(make_table(loc_data[0], loc_data[1:], col_widths=[2.4*inch, 0.7*inch, 3.6*inch]))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# PAGE 5 — CORE FEATURES + SERVER ARCHITECTURE
# ═══════════════════════════════════════════════════════════════════════════════

story.append(Paragraph("4. Core Features", styles["H1"]))

features = [
    ("Ride Booking", "Solo and shared ride modes with distance-based fare calculation, surge pricing, and promo code support. Supports recurring rides and ride scheduling."),
    ("Driver Matching", "Weighted scoring algorithm (50% proximity + 30% rating + 20% acceptance rate). Sequential dispatch with 30-second acceptance timeout per driver."),
    ("Real-Time Tracking", "SSE-based live driver location updates pushed to all ride participants. Location updates throttled to prevent flooding."),
    ("Carpooling", "Marketplace for posting and joining carpools. Route matching via OSRM polyline overlap analysis with configurable detour thresholds."),
    ("Multi-Passenger Stops", "Geographic stop ordering using polyline segment indices. Pickup-before-dropoff constraint enforcement. Dynamic stop insertion for mid-ride joins."),
    ("In-App Chat", "Per-ride chat between driver and passengers with real-time SSE delivery."),
    ("Wallet &amp; Payments", "Digital wallet with top-up, ride payment deduction, driver earnings. Multiple payment methods (card, UPI, wallet)."),
    ("Safety", "Women-only ride mode, SOS emergency alerts with location sharing, safety preferences per user."),
    ("Rewards", "Points-based loyalty system with tier progression (Bronze/Silver/Gold/Platinum). Points earned per ride."),
    ("Notifications", "Multi-channel: in-app (SSE), Expo push (FCM/APNs), Twilio SMS for critical alerts."),
]

for title, desc in features:
    story.append(Paragraph(f'<b>{title}</b> -- {desc}', styles["BulletCustom"]))

story.append(Spacer(1, 16))
story.append(Paragraph("5. Server Architecture", styles["H1"]))

story.append(Paragraph(
    "The server is an Express.js application with tRPC v11 middleware mounted at <font face='Courier'>/api/trpc</font>. "
    "Additional Express routes handle SSE (<font face='Courier'>/api/events</font>), Google Maps proxy, and OAuth callbacks.",
    styles["Body"]))

story.append(Paragraph("Server Entry Point Flow", styles["H3"]))

flow_items = [
    "1. Load environment variables via dotenv",
    "2. Initialize Express app with CORS, cookie-parser, JSON body parser",
    "3. Mount tRPC middleware with createContext (auth via jose JWT)",
    "4. Register SSE endpoint with connection tracking",
    "5. Register dispatch queue event listeners (with removeAllListeners guard for tsx restarts)",
    "6. Start HTTP server on configured port",
    "7. Register SIGINT/SIGTERM handlers for graceful shutdown",
]

for item in flow_items:
    story.append(Paragraph(item, styles["BulletCustom"]))

story.append(Spacer(1, 10))
story.append(Paragraph("Graceful Shutdown Sequence", styles["H3"]))

shutdown_items = [
    "1. Close all active SSE connections (activeSseConnections Set)",
    "2. Shutdown dispatch queue (clear timeouts, maps, listeners)",
    "3. Close notification bus (clear SSE client registry)",
    "4. Close HTTP server (stop accepting new connections)",
    "5. Close database connection pool",
    "6. Force exit after 5-second timeout safety net",
]

for item in shutdown_items:
    story.append(Paragraph(item, styles["BulletCustom"]))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# PAGE 6 — DATABASE SCHEMA + AUTH FLOW
# ═══════════════════════════════════════════════════════════════════════════════

story.append(Paragraph("6. Database Schema", styles["H1"]))
story.append(Paragraph(
    "The database uses MySQL 8.0 with Drizzle ORM for type-safe schema definitions and migrations. "
    "The schema includes 20+ tables covering all aspects of the rideshare platform.",
    styles["Body"]))

tables_data = [
    ["Table", "Purpose", "Key Columns"],
    ["users", "User accounts", "id, phone, email, firstName, lastName, role, gender"],
    ["userProfiles", "Extended profile info", "userId, avatarUrl, bio, vehicleInfo, licenseNumber"],
    ["userPreferences", "Safety/ride preferences", "userId, safetyMode, preferredPayment"],
    ["rides", "Core ride records", "id, passengerId, driverId, status, mode, fare, polyline"],
    ["ridePassengers", "Multi-passenger tracking", "rideId, passengerId, status, fareShare"],
    ["rideStops", "Ordered stops per ride", "rideId, stopType, passengerId, sequence, lat, lng"],
    ["rideRequests", "Pending ride requests", "id, passengerId, status, pickupLat/Lng, dropoffLat/Lng"],
    ["driverSessions", "Driver online/offline state", "driverId, isOnline, lat, lng, lastActiveAt"],
    ["payments", "Payment transactions", "rideId, amount, method, status"],
    ["wallets", "User wallet balances", "userId, balance"],
    ["transactions", "Wallet transaction log", "walletId, amount, type, description"],
    ["notifications", "In-app notification store", "userId, type, title, body, read, deepLink"],
    ["chatMessages", "Per-ride chat messages", "rideId, senderId, message, createdAt"],
    ["ratings", "Post-ride ratings", "rideId, raterId, ratedId, score, comment"],
    ["emergencyAlerts", "SOS alerts", "userId, rideId, lat, lng, status"],
    ["rewardPoints", "Loyalty point balances", "userId, points, tier"],
    ["pointsLedger", "Points transaction history", "userId, points, reason, rideId"],
    ["promoCodes", "Discount codes", "code, discountType, discountValue, maxUses"],
    ["recurringRides", "Scheduled recurring rides", "userId, days, time, pickup, dropoff"],
    ["referrals", "User referral tracking", "referrerId, referredId, status, reward"],
]

story.append(make_table(tables_data[0], tables_data[1:], col_widths=[1.3*inch, 1.8*inch, 3.6*inch]))

story.append(Spacer(1, 16))
story.append(Paragraph("7. Authentication Flow", styles["H1"]))

auth_steps = [
    "1. User enters phone/email on sign-in or sign-up screen",
    "2. Server generates 6-digit OTP, stores with expiry (5 min) and rate limit (1/min per destination)",
    "3. User enters OTP on verify-otp screen",
    "4. Server verifies OTP, creates/fetches user, signs JWT with jose (HS256)",
    "5. JWT set as HTTP-only cookie (session_token) with SameSite=Lax",
    "6. All subsequent requests authenticated via sdk.authenticateRequest() which reads cookie or Bearer token",
    "7. tRPC context.ts calls sdk.authenticateRequest() -- single unified auth path",
    "8. Post-login: justLoggedIn flag triggers animated splash screen while app loads in background",
]

for step in auth_steps:
    story.append(Paragraph(step, styles["BulletCustom"]))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# PAGE 7 — SSE SYSTEM + AUDIT FINDINGS START
# ═══════════════════════════════════════════════════════════════════════════════

story.append(Paragraph("8. Real-Time System (SSE)", styles["H1"]))
story.append(Paragraph(
    "The application uses Server-Sent Events for real-time communication. The SSE endpoint at "
    "<font face='Courier'>/api/events</font> maintains persistent connections per authenticated user. "
    "Events are dispatched through the NotificationEventBus singleton.",
    styles["Body"]))

sse_data = [
    ["Event Type", "Trigger", "Recipients"],
    ["ride_update", "Ride status changes (each step)", "All ride participants"],
    ["location:update", "Driver location change", "Active ride passengers"],
    ["notification", "Any notification sent", "Target user"],
    ["driver:request", "New ride dispatch", "Target driver"],
    ["dispatch:accepted", "Driver accepts ride", "Dispatch listeners"],
    ["dispatch:failed", "All candidates exhausted", "Dispatch listeners"],
    ["chat_message", "New chat message", "Ride participants"],
]

story.append(make_table(sse_data[0], sse_data[1:], col_widths=[1.5*inch, 2.5*inch, 2.7*inch]))

story.append(Spacer(1, 8))
story.append(Paragraph("SSE Connection Lifecycle", styles["H3"]))
sse_lifecycle = [
    "Client connects to /api/events with auth cookie",
    "Server authenticates, adds response writer to notificationBus.sseClients Map",
    "Server adds connection to activeSseConnections Set for shutdown tracking",
    "On client disconnect: cleanup removes writer from bus and Set, deletes empty Sets (memory leak fix)",
    "On server shutdown: closeAll() clears entire sseClients Map, destroys all connections",
]
for item in sse_lifecycle:
    story.append(Paragraph(f"- {item}", styles["BulletCustom"]))

story.append(Spacer(1, 16))
story.append(Paragraph("9. Audit Findings &amp; Fixes", styles["H1"]))
story.append(Paragraph(
    "A comprehensive 5-phase audit was performed covering project discovery, error identification, "
    "bug fixing, hardening, and documentation. The audit identified and fixed 24 issues across "
    "all severity levels.",
    styles["Body"]))

story.append(Paragraph("Critical Severity", styles["H2"]))

critical_fixes = [
    ["#", "Issue", "Root Cause", "Fix Applied"],
    ["1", "No graceful shutdown",
     "Server leaked SSE connections, dispatch timeouts, DB connections, and event listeners on tsx watch restart",
     "Full shutdown handler: SSE close -> dispatch shutdown -> notification bus clear -> HTTP close -> DB pool end -> force exit 5s"],
    ["2", "JWT library mismatch in context.ts",
     "context.ts used jsonwebtoken (string secret) while sdk.ts used jose (Uint8Array). Different verification = auth bypass risk",
     "Removed jsonwebtoken entirely. All auth goes through sdk.authenticateRequest() which handles both Bearer and cookie"],
]

story.append(make_table(critical_fixes[0], critical_fixes[1:], col_widths=[0.3*inch, 1.5*inch, 2.4*inch, 2.5*inch]))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# PAGE 8 — AUDIT FINDINGS CONTINUED
# ═══════════════════════════════════════════════════════════════════════════════

story.append(Paragraph("High Severity", styles["H2"]))

high_fixes = [
    ["#", "Issue", "Fix"],
    ["3", "SSE memory leak: empty Sets accumulated in sseClients Map",
     "unregisterSseClient now deletes empty Sets after removing writer"],
    ["4", "No SSE shutdown method",
     "Added closeAll() to NotificationEventBus that clears entire sseClients Map"],
    ["5", "EventEmitter maxListeners warning on tsx restart",
     "Added setMaxListeners(20) in DispatchQueueManager constructor"],
    ["6", "Dispatch queue has no shutdown method",
     "Added shutdown() that clears all timeouts, queue, pendingForDriver, driverLocations, and removes all listeners"],
    ["7", "DB connection pool never closed",
     "Added closeDbPool() export to db.ts, called during graceful shutdown"],
    ["8", "completeRide crashes on cancelled passengers",
     "Filter allPassengers to exclude cancelled and dropped_off before iterating"],
    ["9", "Driver credited for cancelled passengers' fares",
     "For shared rides, compute totalFare from active passengers' fareShare values only"],
]

story.append(make_table(high_fixes[0], high_fixes[1:], col_widths=[0.3*inch, 2.8*inch, 3.6*inch]))

story.append(Spacer(1, 12))
story.append(Paragraph("Medium Severity", styles["H2"]))

medium_fixes = [
    ["#", "Issue", "Fix"],
    ["10", "updateLocation sends SSE to empty array",
     "Now fetches actual passenger IDs from active ride before pushing location events"],
    ["11", "Duplicate stops created on re-init",
     "Both initializeStopsForRide and insertNewPassengerStops now check existing passenger IDs first"],
    ["12", "recalculateETAs uses inaccurate *111 Euclidean distance",
     "Replaced with proper haversineSimple() function"],
    ["13", "3+ duplicate haversineKm inline functions in routers.ts",
     "Removed all inline copies, use top-level haversineKm function"],
    ["14", "trpc-client.ts created second createTRPCReact instance",
     "Changed to re-export from trpc.ts (single instance)"],
    ["15", "No input validation on geo endpoints",
     "Added lat/lng bounds checking (-90/90, -180/180), positive distances, address length limits"],
    ["16", "No limits on chat messages or wallet amounts",
     "Added .max(2000) for messages, .max(10000) for wallet top-up"],
    ["17", "OTP rate limiting missing",
     "Added 1 OTP per destination per 60s with expired entry cleanup every 5 min"],
    ["18", "ETA throttle map entries never cleaned up",
     "Added cleanup on ride complete and ride cancel"],
]

story.append(make_table(medium_fixes[0], medium_fixes[1:], col_widths=[0.3*inch, 2.8*inch, 3.6*inch]))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# PAGE 9 — LOW SEVERITY + SEVERITY BREAKDOWN
# ═══════════════════════════════════════════════════════════════════════════════

story.append(Paragraph("Low Severity / Hardening", styles["H2"]))

low_fixes = [
    ["#", "Issue", "Fix"],
    ["19", "No API rate limiting",
     "Added 100 req/min per IP rate limiter middleware with auto-purge of stale entries"],
    ["20", "OSRM requests can hang indefinitely",
     "Added AbortSignal.timeout(5000) to all OSRM fetch calls"],
    ["21", "Missing GOOGLE_MAPS_API_KEY crashes server at startup",
     "Changed to warn + graceful degradation instead of throw"],
    ["22", "setTimeout.unref() TypeScript error",
     "Typed for Node/browser compatibility using ReturnType pattern"],
    ["23", "6 frontend TypeScript compilation errors",
     "Fixed across hello-wave, parallax-scroll-view, notifications, sign-in-v2, sign-up, _layout"],
    ["24", "Post-login screen blink/flicker",
     "verify-otp no longer races with _layout splash; waits for justLoggedIn to clear before navigating"],
]

story.append(make_table(low_fixes[0], low_fixes[1:], col_widths=[0.3*inch, 2.8*inch, 3.6*inch]))

story.append(Spacer(1, 20))
story.append(Paragraph("10. Severity Breakdown", styles["H1"]))

# Summary stats
summary_data = [
    ["Severity", "Count", "Status", "Impact"],
    ["CRITICAL", "2", "ALL FIXED", "Auth bypass risk, resource leaks on every restart"],
    ["HIGH", "7", "ALL FIXED", "Memory leaks, 500 errors, financial miscalculation"],
    ["MEDIUM", "9", "ALL FIXED", "Duplicate data, inaccurate calculations, missing validation"],
    ["LOW", "6", "ALL FIXED", "TS errors, UI flicker, missing rate limits"],
    ["TOTAL", "24", "24/24 FIXED", ""],
]

story.append(make_table(summary_data[0], summary_data[1:], col_widths=[1.2*inch, 0.8*inch, 1.3*inch, 3.4*inch]))

story.append(Spacer(1, 16))
story.append(Paragraph("Files Modified", styles["H2"]))

files_data = [
    ["Category", "Files Changed", "Count"],
    ["Server Core", "server/_core/index.ts, context.ts, env.ts", "3"],
    ["Server Services", "driverMatcher.ts, notificationService.ts, stopManager.ts, fareEngine.ts, googleMaps.ts, routeMatcher.ts, rideStateMachine.ts", "7"],
    ["Server API", "routers.ts, db.ts", "2"],
    ["Database", "drizzle/schema.ts, relations.ts, migration SQL", "3"],
    ["Frontend Screens", "verify-otp, _layout, notifications, sign-in-v2, sign-up, + 10 more", "15"],
    ["Frontend Components", "AppLoadingScreen, hello-wave, parallax-scroll-view, icon-symbol, MapViews, StopsList", "9"],
    ["Frontend Libs", "auth-context-v2, trpc-client, theme-provider, utils, types", "5"],
    ["Config", "package.json, tsconfig.json, app.config.ts", "3"],
]

story.append(make_table(files_data[0], files_data[1:], col_widths=[1.4*inch, 3.6*inch, 0.7*inch]))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════════════
# PAGE 10 — REMAINING RISKS + RECOMMENDATIONS
# ═══════════════════════════════════════════════════════════════════════════════

story.append(Paragraph("11. Remaining Risks &amp; Recommendations", styles["H1"]))
story.append(hr())

story.append(Paragraph("Known Remaining Risks", styles["H2"]))

risks = [
    ("In-Memory State Loss", "HIGH",
     "Dispatch queue, driver locations, and SSE connections are in-memory. Server restart loses all active dispatches. "
     "Recommendation: Add Redis for dispatch queue persistence and driver location caching."),
    ("Single Server Limitation", "HIGH",
     "SSE connections are per-process. Cannot horizontally scale without sticky sessions or Redis pub/sub. "
     "Recommendation: Implement Redis pub/sub for cross-instance event delivery."),
    ("No Database Migrations CI", "MEDIUM",
     "Migrations exist but no automated CI/CD pipeline runs them. Manual process is error-prone. "
     "Recommendation: Add drizzle-kit migrate to deployment pipeline."),
    ("No Test Coverage", "MEDIUM",
     "Only 1 test file exists (auth.logout.test.ts). No integration or E2E tests. "
     "Recommendation: Add tests for critical paths: booking, dispatch, fare calculation, auth."),
    ("No Request Logging/Observability", "MEDIUM",
     "No structured logging, no request tracing, no metrics collection. "
     "Recommendation: Add pino logger with request ID propagation, consider OpenTelemetry."),
    ("Twilio Credentials in Env", "LOW",
     "Twilio SID/token stored as plain env vars. "
     "Recommendation: Use a secrets manager (AWS Secrets Manager, Doppler) for production."),
    ("No HTTPS Enforcement", "LOW",
     "Server listens on HTTP. TLS termination assumed at reverse proxy level. "
     "Recommendation: Document TLS requirements, add HSTS headers."),
]

for title, severity, desc in risks:
    color = CRITICAL if severity == "HIGH" else (MEDIUM if severity == "MEDIUM" else LOW)
    story.append(Paragraph(
        f'<font color="{color.hexval()}"><b>[{severity}]</b></font> '
        f'<b>{title}</b>', styles["H3"]))
    story.append(Paragraph(desc, styles["Body"]))

story.append(Spacer(1, 16))
story.append(Paragraph("Recommended Next Steps (Priority Order)", styles["H2"]))

next_steps = [
    "1. Add Redis for dispatch queue persistence and cross-instance SSE pub/sub",
    "2. Write integration tests for booking flow, dispatch, and fare calculation",
    "3. Set up CI/CD with automated database migrations",
    "4. Add structured logging with request tracing (pino + request IDs)",
    "5. Implement WebSocket upgrade path for lower-latency real-time features",
    "6. Add Sentry or similar error tracking for production monitoring",
    "7. Set up load testing to identify performance bottlenecks",
    "8. Add API documentation (OpenAPI/Swagger from tRPC schema)",
    "9. Implement proper secrets management for production credentials",
    "10. Add E2E tests with Detox (native) and Playwright (web)",
]

for step in next_steps:
    story.append(Paragraph(step, styles["BulletCustom"]))

story.append(Spacer(1, 24))
story.append(hr())
story.append(Paragraph(
    '<font color="%s"><b>Document generated: March 2026</b></font> | '
    'RideShare v1.0 Technical Documentation' % TEXT_MED.hexval(),
    styles["Footer"]))

# ─── Build ───────────────────────────────────────────────────────────────────

doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
print(f"PDF generated: {OUTPUT}")
print(f"Size: {os.path.getsize(OUTPUT) / 1024:.1f} KB")
