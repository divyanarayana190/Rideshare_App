# YOO Admin Platform V2 — Audit Report

**Generated:** 2026-06-20  
**Scope:** Full audit of admin panel, backend routes, database schema, and alignment with Enterprise Mobility Operating System requirements  
**Status:** Pre-implementation — no code changes made  

---

## Executive Summary

The YOO Admin Platform is a **broad, API-backed operations console** with **28 feature pages**, **~140 REST endpoints** under `/admin/*`, and coverage of users, drivers, rides, payments, safety, fraud, analytics, support, and compliance. It is **not yet enterprise-grade**: RBAC is mostly cosmetic, many lists lack pagination, admin finance still reads the **deprecated `payments` table** instead of canonical **`stripe_payments`**, and several client/server API contracts are **broken**.

The database has **58 tables** with good ride/payment indexing but **no FK constraints**, **no corporate domain**, and **28 tables unused by admin**. University data exists only as denormalized fields on `user_profiles` — no dedicated institutions table.

**Verdict:** Strong foundation for incremental upgrade. Implementation should proceed phase-by-phase after fixing contract bugs and payment-table migration. **No mock data or placeholder analytics should be added** — all new metrics must query existing tables.

---

## 1. Current State

### 1.1 Admin Panel Architecture

| Attribute | Value |
|-----------|-------|
| Stack | Vite + React 19 + TypeScript + React Router v7 |
| Dev port | 5173 (proxies `/admin` → server :3001) |
| Auth | JWT in `localStorage` (`admin_token`) |
| State | Zustand (auth, theme); mixed TanStack Query + `useEffect` fetch |
| Realtime | Socket.IO namespace `/admin` — used only on Live Map |
| Theme | Dark/light via `theme` store |
| Tests | **None** in `admin-panel/` |

### 1.2 Existing Pages (28 operational + login)

| Group | Pages | Data source |
|-------|-------|-------------|
| **Core** | Dashboard, Messages, Live Map, Incidents | Real APIs + WebSocket (map only) |
| **Users & Drivers** | Users, Drivers, Driver Applications, Driver Intelligence, User Intelligence, Ratings | Real APIs |
| **Operations** | Rides, Payments, Finance, Pricing Rules, Fraud, Safety, Promos | Real APIs |
| **Platform** | Feature Flags, A/B Tests, Webhooks, Infra Health | Real APIs |
| **Admin** | Notifications, Operations (surge/config), Analytics, Alert Rules, Audit Logs, Legal Compliance, Support | Real APIs |

### 1.3 Existing Functionality (Working)

- **User management:** List/search/filter/paginate, ban/unban, bulk ban, role/gender/driver toggles, CSV export, detail panel with wallet/rides/transactions
- **Driver management:** List with online/offline/banned tabs, suspend/activate, manual Stripe payout, export
- **Driver onboarding:** Application review workflow with R2 signed document URLs, approve/reject/request-changes
- **Ride operations:** List/filter/paginate, active rides panel (15s poll), cancel/bulk cancel, detail with passengers/payments/chat
- **Payments:** Legacy payment list, wallet transactions, driver payouts, refunds (DB-only, no Stripe call)
- **Finance:** P&L breakdown, chargebacks, period filters (7/30/90d)
- **Safety:** Emergency/SOS alert list, status updates, 15s refresh
- **Fraud:** Flag review queue, pattern detection scan, manual scan trigger
- **Analytics:** Revenue chart, rides/day, user growth, popular routes, peak hours, summary KPIs, linear forecast (requires historical data)
- **Support:** Ticket CRUD with filters/pagination, FAQ CMS, live chat queue
- **Compliance:** Legal policy stats, acceptance log (read-only)
- **Operations:** Surge zone CRUD, platform config KV editor
- **Platform tooling:** Feature flags, A/B tests, webhooks, alert rules, system alerts, audit logs, global search
- **Incident command:** Create/update incidents, timeline, emergency broadcast (partial — see bugs)
- **Intelligence:** Driver scorecards, churn risk, onboarding funnel, user journey, cohort retention, LTV segments

### 1.4 Dashboard Metrics Today (vs Phase 1 Requirements)

| Phase 1 Metric | Available today? | Source |
|-----------------|------------------|--------|
| Revenue Today | ✅ Partial | `GET /admin/stats` → `todayRevenue` |
| Revenue This Week | ❌ | Not exposed |
| Revenue This Month | ❌ | Not exposed |
| GMV | ❌ | Not computed |
| Platform Take Rate | ❌ | Hardcoded "15% rate" label in UI only |
| Active Drivers | ✅ Partial | `totalDrivers` in stats |
| Online Drivers | ✅ | `onlineDrivers` |
| Active Passengers | ❌ | Not computed |
| Trips Today | ✅ | `todayRides` |
| Trips In Progress | ✅ Partial | `activeRides` (includes searching/matched) |
| Trips Waiting For Driver | ❌ | Not broken out |
| Completed Trips | ❌ | Not on dashboard (analytics summary only) |
| Cancelled Trips | ❌ | Not on dashboard |
| Driver Utilization | ⚠️ Backend only | `GET /admin/sla-metrics` — **no UI** |
| Marketplace Fill Rate | ⚠️ Backend only | `sla-metrics.matchRate` — **no UI** |
| Average Wait Time | ❌ | SLA endpoint uses simulated ETA |
| Average Ride Distance | ❌ | Not computed |
| Average Ride Duration | ❌ | Not computed |
| Repeat Rider % | ❌ | Not computed |
| DAU / WAU / MAU | ❌ | Not computed |
| User Growth % | ❌ | Chart only, no % delta on dashboard |
| Driver Growth % | ❌ | Not computed |
| Revenue Growth % | ❌ | Not computed |
| Support Tickets Open | ⚠️ | Ticket stats API exists, not on dashboard |
| Safety Incidents | ✅ Partial | `pendingAlerts` + active SOS list |
| Fraud Alerts | ❌ | Not on dashboard |
| System Health | ⚠️ | Infra health page exists, not on dashboard |

---

## 2. Database Coverage

### 2.1 Table Inventory (58 tables)

| Domain | Tables | Count |
|--------|--------|-------|
| Users | users, user_profiles, user_preferences, push_tokens, reward_points, account_deletion_requests, data_export_requests | 7 |
| Drivers | driver_sessions, driver_schedule_settings, driver_availability_slots, driver_applications, file_uploads, connected_accounts | 6 |
| Passengers | ride_passengers, passenger_requests | 2 |
| Rides | rides, ride_requests, ride_stops, recurring_rides, carpool_join_requests, chat_messages | 6 |
| Payments | payments (deprecated), wallets, transactions, payment_methods, stripe_* (6), credit_* (4), promo_codes, promo_usage, referrals, surge_zones, pricing_rules | 18 |
| Notifications | notifications | 1 |
| Compliance | legal_acceptances, legal_policy_versions, admin_audit_logs | 3 |
| Analytics | analytics (daily rollups), platform_config | 2 |
| Safety | emergency_alerts | 1 |
| Fraud | fraud_flags, abuse_flags | 2 |
| University | student_verifications (+ profile fields) | 1 |
| Corporate | **None** | 0 |
| Support | support_tickets, support_messages, faq_items, live_chat_sessions, live_chat_messages | 5 |
| Alerts/Ops | system_alerts, alert_rules, incidents, incident_actions, feature_flags, ab_tests, webhooks, webhook_deliveries | 8 |

**Not persisted:** Driver GPS locations (in-memory via WebSocket only).

### 2.2 Admin vs App Table Usage

| Admin uses (32 tables) | Exists but admin does NOT use (26 tables) |
|------------------------|-------------------------------------------|
| users, user_profiles, rides, ride_passengers, payments*, transactions, wallets, driver_sessions, emergency_alerts, promo_codes, referrals, ratings, surge_zones, notifications, chat_messages, driver_applications, support_*, live_chat_*, admin_audit_logs, platform_config, system_alerts, alert_rules, connected_accounts, incidents, incident_actions, pricing_rules, feature_flags, ab_tests, fraud_flags, webhooks, webhook_deliveries, legal_* | user_preferences, driver_schedule_*, ride_requests, recurring_rides, carpool_join_requests, ride_stops, analytics, payment_methods, stripe_payments**, stripe_transfers, stripe_refunds, stripe_customers, stripe_payment_methods, webhook_events, credit_*, abuse_flags, push_tokens, passenger_requests, student_verifications, account_deletion_requests, data_export_requests, promo_usage, file_uploads, reward_points, points_ledger |

\* Admin reads **deprecated `payments`**, not canonical `stripe_payments`.  
\** Critical gap for accurate revenue/GMV/take-rate.

### 2.3 Missing Relationships

- **No database-level foreign keys** — all relationships are logical via int/varchar columns
- Drizzle `relations.ts` covers ~25 tables only
- `rides.rideId` (varchar) vs `rides.id` (int) dual-key pattern creates join complexity
- `support_messages.ticketId` references varchar `support_tickets.ticketId`, not PK
- No `universities` or `companies` entity tables — segmentation must be derived from profile fields (`studentUniversityDomain`, email domain)

### 2.4 Missing Indexes (Recommended)

| Table | Gap | Impact at scale |
|-------|-----|-----------------|
| `user_profiles` | No index on `isDriver`, `isBanned`, `isStudentVerified`, `studentUniversityDomain` | Slow driver/student filters |
| `users` | No index on `email`, `role`, `createdAt` | Slow admin user search/growth queries |
| `rides` | No composite `(status, createdAt)` | Dashboard status counts scan |
| `rides` | No index on `mode`, `safetyMode` | Marketplace ops filters |
| `emergency_alerts` | No index on `status, createdAt` | Safety command center |
| `fraud_flags` | No index on `createdAt` | Fraud trend queries |
| `support_tickets` | No composite `(status, priority, createdAt)` | SLA breach detection |
| `admin_audit_logs` | No index on `createdAt` alone | Time-range audit export |
| `notifications` | No index on `createdAt` | Broadcast history |
| `driver_applications` | No index on document expiry fields | Phase 3 compliance monitoring |
| `analytics` | Table exists but **never queried by admin** | Wasted pre-aggregation opportunity |

Existing strong indexes: `rides` (8), `stripe_payments` (5), `ride_passengers`, `ratings`, `driver_sessions` geo/status.

---

## 3. API Coverage

### 3.1 Endpoint Summary

| Layer | Count | Auth |
|-------|-------|------|
| REST `/admin/*` | ~140 | JWT `requireAdmin` middleware |
| tRPC admin | 3 | `adminProcedure` |
| WebSocket `/admin` | 1 namespace | JWT on connect |

### 3.2 API Coverage by Phase

| Phase | Existing APIs | Gaps |
|-------|---------------|------|
| **1 Executive Dashboard** | `/admin/stats`, `/admin/stats/revenue`, `/admin/analytics/summary`, `/admin/sla-metrics` (unused) | Single aggregated executive endpoint; week/month revenue; DAU/WAU/MAU; growth %; GMV; take rate from real config |
| **2 Marketplace Ops** | `/admin/sla-metrics`, `/admin/demand-heatmap`, `/admin/rides/active`, WebSocket drivers | Supply/demand zones UI; city/university/company filters; unified command center page |
| **3 Driver Management** | `/admin/drivers`, `/admin/driver-applications`, scorecard/churn APIs | Document expiry monitoring; compliance module; violation/suspension history; dedicated detail page |
| **4 Passenger Management** | `/admin/users` (passenger filter), user-journey | Risk/fraud score; dedicated passenger center; payment history from stripe |
| **5 Safety Command** | `/admin/safety/alerts`, ratings unsafe flag | Severity taxonomy; harassment/speeding events; timeline; map (placeholder today) |
| **6 Fraud Intelligence** | `/admin/fraud-flags`, `/admin/pattern-detection` | Fraud score 0–100 with explanations; GPS spoofing; referral abuse; trends |
| **7 University Dashboard** | Student filter on users | Aggregate by `studentUniversityDomain`; routes/retention per institution |
| **8 Corporate Dashboard** | **None** | No corporate tables or email-domain grouping API |
| **9 Analytics Redesign** | 6 analytics endpoints + forecast | Funnel charts; cohort; cancellation analysis; retention |
| **10 Alert Engine** | `/admin/alert-rules`, `/admin/system-alerts` | 9 new alert types; multi-channel notify (email/push/webhook/SMS) |
| **11 Support Ops** | Tickets, chat, FAQs | SLA tracking UI; agent performance; escalation queue (backend partial) |
| **12 Legal & Compliance** | `/admin/legal/*` | GDPR/CCPA request queues; policy publish; evidence export |
| **13 Performance** | `/admin/infra-health` | Query audit; caching layer; bundle optimization |
| **14 Enterprise Features** | CSV export (4 entities), global search | Saved filters; custom dashboards; widget system; Excel/PDF; department RBAC |

### 3.3 Unused / Orphaned APIs

| Endpoint | Notes |
|----------|-------|
| `GET /admin/sla-metrics` | Real metrics (utilization, match rate) — **no UI consumer** |
| `GET /admin/drivers/online` | Superseded by WebSocket |
| `GET /admin/driver-applications/:id` | List embeds detail |
| `DELETE /admin/users/:id` | Stub — logs only, no DB delete |
| `GET /admin/r2-health` | Tests only |
| `PATCH/DELETE /admin/ab-tests/:id` | No panel usage |
| `GET /admin/onboarding-funnel` | Alias unused (panel uses `driver-onboarding-funnel`) |
| tRPC `system.notifyOwner` | No callers |
| tRPC `diagnostics.getSchemaHealth` | No admin panel caller |
| `walletCreditService.adminAdjustCredits` | No REST exposure |

### 3.4 Client/Server Contract Bugs (Must Fix First)

| Client | Calls | Server expects | Impact |
|--------|-------|----------------|--------|
| `auth.ts` | `POST /admin/auth/setup` | **Not implemented** | First-run bootstrap fails |
| `FraudPage` | `PATCH /admin/fraud-flags/:id/review` | `PATCH /admin/fraud-flags/:id` | Review actions fail |
| `IncidentCommandPage` | `PATCH .../resolve` | `POST .../resolve` | Resolve fails |
| `IncidentCommandPage` | `POST /admin/incidents/broadcast` | `POST /admin/incidents/:id/broadcast` | Broadcast fails |
| `IncidentCommandPage` | `POST .../:id/actions` | Only `GET .../:id/actions` | Timeline notes fail |
| `IncidentCommandPage` | `status=open,investigating` | Single enum value | Filter returns empty |

### 3.5 Duplicate Functionality

| Area | Duplication |
|------|-------------|
| Driver applications | Admin REST reimplements logic in `driverApplicationService.ts` |
| Dashboard vs Analytics | Overlapping revenue/ride metrics with different endpoints |
| Safety alerts | Shown on Dashboard AND Safety page (same API) |
| Driver intelligence vs Drivers page | Overlapping driver stats, no cross-links |
| Fraud vs pattern detection | Two surfaces, no unified case workflow |
| Payments vs Finance | Split legacy payments vs P&L without clear canonical source |
| Live Map vs Operations surge | Same surge zone API, no shared map component for ops |
| Chat (Messages) vs Support tickets | Parallel support channels, no unified queue |

### 3.6 Dead Code

| Location | Issue |
|----------|-------|
| `admin.ts` imports | `promoUsage`, `fileUploads` imported but never queried |
| `usePermissions` hook | Defined with full matrix; **never used** in pages |
| `RequireRole` vs `IfRole` | Only 6 pages use `IfRole`; no route-level guards |
| `DELETE /admin/users/:id` | Stub endpoint |
| `analytics` table | Written by app, never read by admin |
| `Header.tsx` notification bell | Decorative red dot, no API |

---

## 4. Missing Features (By Phase)

### Phase 1 — Executive Dashboard
- [ ] Dedicated executive page (current dashboard is basic 4-stat + charts)
- [ ] 25+ KPIs from real DB (see gap table §1.4)
- [ ] Revenue week/month, GMV, take rate from `platform_config` or stripe data
- [ ] DAU/WAU/MAU from `users.lastSignedIn` or ride activity
- [ ] Growth % period-over-period
- [ ] Wire existing `/admin/sla-metrics` into UI

### Phase 2 — Marketplace Operations Center
- [ ] Unified command center page
- [ ] Real-time supply/demand zone visualization
- [ ] Filters: city, university, company, date, ride type, women-only, student, corporate, scheduled/immediate
- [ ] WebSocket on ops dashboard (not just live map)

### Phase 3 — Driver Management
- [ ] Driver detail page (compliance, documents, history, payouts, audit)
- [ ] Document expiration monitoring (license, insurance, registration, background check)
- [ ] 30/15/7-day/expired warnings from `driver_applications` + `file_uploads`
- [ ] Violation/suspension/risk profile modules

### Phase 4 — Passenger Management
- [ ] Dedicated passenger center (beyond user list filter)
- [ ] Stripe payment history, risk/fraud scores, referral/cancellation history

### Phase 5 — Safety Command Center
- [ ] Replace map placeholder with real map
- [ ] Severity classification (Critical/High/Medium/Low)
- [ ] Harassment, speeding, women-only violation tracking (partial data in ratings/alerts)
- [ ] Searchable/filterable incident timeline

### Phase 6 — Fraud Intelligence Center
- [ ] Unified fraud score 0–100 with explanations
- [ ] GPS spoofing, multi-account, ride farming, referral abuse detection
- [ ] Wire `abuse_flags` (wallet) into admin view
- [ ] Fraud trend charts

### Phase 7 — University Intelligence Dashboard
- [ ] Auto-discover institutions from `studentUniversityDomain`
- [ ] Per-university: students, drivers, trips, revenue, routes, peak hours, retention, safety
- [ ] **No hardcoded university list**

### Phase 8 — Corporate Mobility Dashboard
- [ ] **Blocked:** No corporate schema — requires email-domain inference or new tables
- [ ] Group by employer domain from user email

### Phase 9 — Analytics Redesign
- [ ] Marketplace/ride/driver/passenger/revenue funnels
- [ ] Cohort + retention (partial — cohort API exists)
- [ ] Cancellation/conversion/geographic analysis
- [ ] Keep forecast only when sufficient history (already implemented)

### Phase 10 — Alert Engine
- [ ] 9 new alert rule types (driver shortage, demand spike, revenue drop, etc.)
- [ ] Multi-channel delivery: admin panel, email, push, webhook, SMS
- [ ] Alert rules table exists; notification channels not wired

### Phase 11 — Support Operations
- [ ] SLA tracking UI (metrics computable from tickets)
- [ ] Escalation queue, agent performance
- [ ] Knowledge base exists (FAQs); no macro templates

### Phase 12 — Legal & Compliance
- [ ] GDPR/CCPA request queues (`account_deletion_requests`, `data_export_requests` exist, no admin UI)
- [ ] Policy publish workflow, audit evidence export

### Phase 13 — Performance
- [ ] Query optimization, caching (insights already 5min cache)
- [ ] Pagination on all lists
- [ ] Admin bundle size audit

### Phase 14 — Enterprise Features
- [ ] Saved filters, custom dashboards, widget system
- [ ] Export CSV (exists), Excel, PDF
- [ ] Department-level RBAC, admin activity feed
- [ ] Cross-module advanced search (global search exists, limited)

---

## 5. Security Issues

| Priority | Issue | Location | Remedy |
|----------|-------|----------|--------|
| **Critical** | JWT in `localStorage` — XSS exfiltration risk | `admin-panel/src/lib/api.ts`, `auth.ts` | HttpOnly secure cookies or short-lived token + refresh |
| **Critical** | Export passes token in query string | `PaymentsPage.tsx` `?token=` | Authorization header or signed download URLs |
| **High** | RBAC not enforced server-side per endpoint | Most `/admin/*` routes | Role checks on mutating routes; audit role in JWT claims |
| **High** | RBAC not enforced client-side | 22 of 28 pages have no `IfRole` | Route guards + nav hiding by role |
| **High** | `canManageAdmins` permission exists, no admin-users page | `usePermissions.ts` | Admin user management + invite flow |
| **High** | Refund endpoint marks DB only — no Stripe reconciliation | `/admin/payments/:id/refund` | Stripe refund API + idempotency |
| **Medium** | No MFA / SSO | Login page | Enterprise auth |
| **Medium** | Bulk ban hardcoded reason | `UsersPage.tsx` | Require reason input |
| **Medium** | Critical actions use `prompt()`/`confirm()` | Rides, Drivers, Users | Validated modals with audit trail |
| **Medium** | `POST /admin/auth/setup` missing | Client expects bootstrap | Implement or remove client call |
| **Low** | Admin role stored as `users.role = 'admin'` only | Schema | Separate admin roles table or profile field for ops/support/super_admin |

---

## 6. Performance Issues

| Priority | Issue | Impact at 100K+ users / 1M rides |
|----------|-------|----------------------------------|
| **High** | Many unpaginated lists (promos, referrals, incidents, alert rules, safety alerts, feature flags, webhooks, pricing rules, FAQs, chargebacks, payouts) | Memory/timeout |
| **High** | Client-side search on paginated data (ratings, payments) | Incorrect results |
| **High** | Admin reads deprecated `payments` not `stripe_payments` | Inaccurate + full table scan risk |
| **High** | `GET /admin/stats` runs 8+ sequential COUNT queries | Slow dashboard load |
| **Medium** | No query result caching except AI insights (5min) | Repeated aggregate load |
| **Medium** | Export hard limit 10,000 rows, no cursor | Incomplete exports |
| **Medium** | Demand heatmap limit 2000 points, no spatial index | Acceptable for now |
| **Medium** | Messages/chat polling (10s) instead of WebSocket | Server load |
| **Low** | Mixed fetch patterns (no consistent React Query cache) | Stale data, over-fetch |
| **Low** | `analytics` daily rollup table unused | Missed read optimization |

### Scale Readiness Estimate

| Entity | Current handling | At target scale |
|--------|------------------|-----------------|
| 100K users | Server pagination on users list | Needs email/createdAt indexes |
| 50K drivers | Paginated, status filter | Needs `isDriver` index on profiles |
| 1M rides | Paginated list, aggregate queries unoptimized | Needs materialized summaries or `analytics` table reads |

---

## 7. Recommended Improvements

### 7.1 Immediate (Pre-Phase 1)

1. **Fix 5 client/server contract bugs** (§3.4) — incidents, fraud, auth setup
2. **Migrate admin payment reads** from `payments` → `stripe_payments` + transfers/refunds
3. **Expose `/admin/sla-metrics`** on dashboard — real utilization/fill rate already computed
4. **Add missing indexes** on `user_profiles`, `users.email`, `rides(status, createdAt)`
5. **Remove or implement** dead endpoints (`DELETE users`, auth setup)

### 7.2 Architecture

1. **Single executive stats endpoint** — one cached aggregate query replacing dashboard fan-out
2. **Consistent data layer** — TanStack Query everywhere with staleTime/refetchInterval
3. **Server-side search** on all list endpoints (ratings, payments)
4. **Cursor pagination** for audit logs, rides, users at scale
5. **Role middleware** — `requireRole('admin'|'ops'|'support')` on routes
6. **Reuse `driverApplicationService`** in admin routes — delete duplicate logic

### 7.3 Data Integrity

1. Add FK constraints in production-safe migrations (optional but recommended)
2. Create **`universities` view** (SQL view over `user_profiles.studentUniversityDomain`) — no new table required initially
3. Corporate dashboard via **email domain grouping** until B2B schema exists

### 7.4 UX / Enterprise

1. Replace Safety map placeholder with shared Leaflet component from Live Map
2. Driver/passenger detail pages with tabbed history
3. Error boundaries on all pages
4. Optimistic updates on status toggles
5. Saved filters in localStorage → DB for Phase 14

---

## 8. Implementation Plan

### Wave 0 — Foundation (1–2 weeks)
- Fix API contract bugs
- Payment table migration for admin
- Add critical indexes
- Enforce RBAC on mutating routes
- Wire `sla-metrics` to dashboard

### Wave 1 — Phase 1 Executive Dashboard (2 weeks)
- New `/executive` page or upgrade `/dashboard`
- `GET /admin/executive-metrics` — single aggregated endpoint
- All Phase 1 KPIs from DB queries (no hardcoded values)
- Remove "15% rate" hardcode — read from `platform_config`

### Wave 2 — Phases 2–3 Marketplace + Drivers (3 weeks)
- Marketplace command center page
- WebSocket integration for ops
- Driver detail + document expiry module
- University domain filter (from profile data)

### Wave 3 — Phases 4–6 Passengers, Safety, Fraud (3 weeks)
- Passenger center
- Safety command center (real map, severity, filters)
- Fraud score engine using existing `fraud_flags` + ride patterns

### Wave 4 — Phases 7–9 Intelligence + Analytics (3 weeks)
- University dashboard (auto-discovered domains)
- Corporate dashboard (email domain grouping)
- Analytics funnel redesign

### Wave 5 — Phases 10–12 Alerts, Support, Compliance (2 weeks)
- Alert channel wiring (webhook exists, extend to email/SMS)
- SLA dashboard for support
- GDPR/CCPA admin queues

### Wave 6 — Phases 13–14 Performance + Enterprise (2 weeks)
- Pagination sweep
- Caching layer
- Export formats, saved filters, widget foundation

**Total estimated effort:** 16–18 weeks incremental, assuming no schema changes for corporate/universities initially.

---

## 9. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Payment data inconsistency (`payments` vs `stripe_payments`) | High | Revenue/GMV wrong | Migrate admin reads first; validate against Stripe |
| RBAC bypass | High | Unauthorized mutations | Server-side role middleware before new features |
| Scale timeouts on aggregates | Medium | Dashboard unusable at 1M rides | Materialized views / `analytics` table / Redis cache |
| No corporate schema blocks Phase 8 | Certain | Feature incomplete | Ship email-domain grouping; defer B2B tables |
| Client/server bugs in production | High | Broken incident/fraud flows | Wave 0 fixes before any new UI |
| JWT in localStorage | Medium | Account compromise | Plan cookie migration; CSP headers |
| Schema migration failures | Low | Downtime | Production-safe migrations only; no FK in v1 if risky |
| Over-engineering dashboards | Medium | Delayed value | Reuse existing APIs; one endpoint per page max |

---

## 10. Appendix

### A. Admin Panel File Map

```
admin-panel/src/
├── App.tsx              # 29 routes
├── pages/               # 28 feature pages
├── components/layout/   # AdminLayout, Sidebar, Header
├── components/          # GlobalSearch, RequireRole
├── hooks/               # useAdminSocket, usePermissions, useRole
├── store/               # auth, theme
└── lib/api.ts           # Fetch wrapper
```

### B. Backend Admin File Map

```
server/routes/admin.ts           # ~95 routes
server/routes/admin-advanced.ts  # ~45 routes
server/services/
  ├── supportService.ts
  ├── liveChatService.ts
  ├── paymentLedgerService.ts
  ├── legalService.ts
  ├── websocket.ts
  └── driverApplicationService.ts  # unused by admin REST
```

### C. Hardcoded / Placeholder Items to Eliminate

| Item | File | Replace with |
|------|------|--------------|
| "15% rate" commission | PaymentsPage.tsx | `platform_config` take rate |
| San Francisco map center | LiveMapPage.tsx | Configurable market center from surge zones or config |
| Safety map placeholder | SafetyPage.tsx | Leaflet map component |
| Simulated ETA in sla-metrics | admin-advanced.ts | Real wait time from ride timestamps |
| Header notification dot | Header.tsx | Real alert count API |
| Bulk ban reason | UsersPage.tsx | User-provided reason |

---

## Next Step

**Await report approval before implementation.**

Recommended first action upon approval: **Wave 0** (contract fixes + payment migration + indexes + sla-metrics on dashboard).

No mock data. No placeholder charts. All metrics from existing MySQL tables and services.
