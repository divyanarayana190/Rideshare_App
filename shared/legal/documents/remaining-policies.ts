import type { LegalDocument } from "../types";
import { section } from "../buildSection";
import { CURRENT_LEGAL_VERSION } from "../version";

export const communityGuidelines: LegalDocument = {
  id: "community-guidelines",
  slug: "community-guidelines",
  title: "Community Guidelines",
  version: CURRENT_LEGAL_VERSION,
  lastUpdated: "2026-06-09",
  description: "Standards of behavior for all YOO users.",
  sections: [
    section("purpose", "1. Purpose", [
      "YOO connects people for shared transportation. These Community Guidelines set minimum standards so everyone feels safe and respected. Violations may result in warnings, temporary restrictions, or permanent account removal.",
    ]),
    section("respect", "2. Respectful Behavior", [
      "Treat drivers, riders, carpool hosts, and support staff with courtesy. No abusive language, intimidation, unwanted physical contact, or deliberate delays intended to harm another user.",
    ]),
    section("passengers", "3. Passenger Conduct", [
      "Be at the pickup location on time, wear seatbelts, do not damage vehicles, follow reasonable driver instructions related to safety, and do not bring more passengers than booked seats allow.",
      "Do not ask drivers to break traffic laws, carry prohibited items, or complete trips off-platform to avoid fares.",
    ]),
    section("drivers", "4. Driver Conduct", [
      "Maintain a professional environment, drive safely, keep vehicles reasonably clean, honor posted fares, and complete trips through the app. Do not request cash or external payments.",
    ]),
    section("harassment-discrimination", "5. Harassment & Discrimination", [
      "Harassment, sexual misconduct, hate speech, slurs, threats, stalking, or discrimination based on race, color, religion, national origin, gender, gender identity, sexual orientation, disability, age, or other protected status is strictly prohibited.",
      "Women-only or safety-preference matching is a user-selected feature and does not permit harassment of any user.",
    ]),
    section("illegal-conduct", "6. Illegal Activities", [
      "Do not use YOO for unlawful purposes including transport of illegal drugs, stolen goods, unlicensed weapons, or human trafficking. Report suspicious activity through the app or emergency services.",
    ]),
    section("weapons-drugs-alcohol", "7. Weapons, Drugs & Alcohol", [
      "Unauthorized weapons are prohibited in vehicles. Open containers of alcohol and illegal substances are prohibited. Drivers must not operate while impaired.",
    ]),
    section("fraud", "8. Fraud & Impersonation", [
      "Do not create duplicate accounts, impersonate others, manipulate ratings, abuse promotions, submit false safety reports, or use stolen payment methods.",
    ]),
    section("reporting", "9. Reporting Violations", [
      "Use in-app reporting, Help & Support, or safety@yoo.app. For immediate danger, contact local emergency services first.",
    ]),
  ],
};

export const safetyPolicy: LegalDocument = {
  id: "safety-policy",
  slug: "safety-policy",
  title: "Safety Policy",
  version: CURRENT_LEGAL_VERSION,
  lastUpdated: "2026-06-09",
  description: "Safety standards, emergency procedures, and reporting on YOO.",
  sections: [
    section("commitment", "1. Our Safety Commitment", [
      "YOO invests in verification, in-trip tools, incident response workflows, and 24/7 support channels to reduce harm. No system eliminates all risk; users must exercise judgment and follow these procedures.",
    ]),
    section("emergency", "2. Emergency Procedures", [
      "In immediate danger, contact local emergency services (e.g., 911 in the U.S.) first. Then use the in-app SOS or Emergency feature to alert YOO with your location and trip details.",
      "YOO may share limited trip and location data with emergency responders when you activate SOS or when required by law.",
    ]),
    section("reporting", "3. Reporting & Incident Response", [
      "Report accidents, assaults, harassment, unsafe driving, or vehicle issues through Help & Support or safety@yoo.app. Include ride ID, time, and description. Serious incidents may result in temporary holds on accounts pending investigation.",
    ]),
    section("passenger-safety", "4. Passenger Safety", [
      "Verify driver name, photo, vehicle, and license plate before entering. Share trip status with trusted contacts. Sit in the rear when alone. End the trip in-app if you feel unsafe and contact support.",
    ]),
    section("driver-safety", "5. Driver Safety", [
      "Confirm passenger identity matches the app. Keep doors locked until identity is verified. End trips for abusive behavior and report immediately. Do not pursue passengers off-platform.",
    ]),
    section("women-only", "6. Women-Only & Safety Matching", [
      "Optional matching features use self-reported profile data. They are intended to increase comfort but do not guarantee user identity or eliminate all risks. Report misuse immediately.",
    ]),
    section("student-rides", "7. Student Rides", [
      "Student verification confirms email domain ownership, not conduct or criminal history. Student promotions are subject to eligibility rules and may require periodic reverification.",
    ]),
    section("investigations", "8. Investigations", [
      "YOO may review GPS logs, chat messages, ratings, and user statements during investigations. Outcomes may include warnings, training requirements, temporary suspension, or permanent removal from the Platform.",
    ]),
  ],
};

export const cookiePolicy: LegalDocument = {
  id: "cookie-policy",
  slug: "cookie-policy",
  title: "Cookie & Analytics Policy",
  version: CURRENT_LEGAL_VERSION,
  lastUpdated: "2026-06-09",
  description: "How YOO uses cookies, analytics, and similar technologies.",
  sections: [
    section("overview", "1. Overview", [
      "This policy describes technologies YOO uses on our web properties and mobile SDKs to operate services, remember preferences, measure performance, and improve security.",
    ]),
    section("cookies", "2. Cookies & Local Storage", [
      "We use session cookies and local storage for authentication tokens, admin sessions, and user preferences on web builds. These are necessary for core functionality.",
    ]),
    section("analytics", "3. Analytics & Diagnostics", [
      "We use analytics and crash reporting tools (such as Sentry and product analytics) to understand app stability, feature usage, and error rates. Data may include device type, app version, anonymized user IDs, and crash stack traces.",
    ]),
    section("mobile-identifiers", "4. Mobile Identifiers", [
      "Mobile apps may use device identifiers and push tokens to deliver notifications and prevent fraud. You can disable push notifications in device settings.",
    ]),
    section("third-parties", "5. Third-Party Technologies", [
      "Stripe, Google Maps, and authentication providers may set their own cookies or SDK identifiers subject to their policies when you use integrated features.",
    ]),
    section("choices", "6. Your Choices", [
      "Browser users may block cookies, though some features may not work. Mobile users may limit ad tracking through OS settings where available. Contact privacy@yoo.app for questions.",
    ]),
  ],
};

export const dataRetentionPolicy: LegalDocument = {
  id: "data-retention",
  slug: "data-retention",
  title: "Data Retention Policy",
  version: CURRENT_LEGAL_VERSION,
  lastUpdated: "2026-06-09",
  description: "How long YOO retains different categories of data.",
  sections: [
    section("overview", "1. Overview", [
      "YOO retains data only as long as necessary for the purposes described in our Privacy Policy, unless a longer period is required by law or legitimate business need.",
    ]),
    section("account", "2. Account & Profile Data", [
      "Active account data is retained while your account exists. After deletion request, profile data is deleted or anonymized within 30 days except where retention is legally required.",
    ]),
    section("trips", "3. Trip & Location Data", [
      "Completed trip records including pickup/drop-off, route, fare, and ratings are retained for up to 7 years for tax, insurance, fraud prevention, and dispute resolution. Live location telemetry during trips is retained for a shorter operational window then aggregated or deleted.",
    ]),
    section("payments", "4. Payment Records", [
      "Transaction records processed via Stripe are retained for at least 7 years to comply with financial and tax regulations.",
    ]),
    section("driver-docs", "5. Driver Verification Records", [
      "Driver application documents and approval history are retained for the duration of driver eligibility plus 3 years after deactivation for regulatory and safety purposes.",
    ]),
    section("support-safety", "6. Support & Safety Records", [
      "Support tickets and safety incident reports may be retained up to 7 years depending on severity and legal obligations.",
    ]),
    section("logs", "7. Technical Logs", [
      "Server logs, security logs, and analytics events are typically retained 90–400 days unless needed for an active investigation.",
    ]),
    section("legal-holds", "8. Legal Holds", [
      "Data subject to litigation hold, law enforcement request, or regulatory inquiry may be preserved beyond standard schedules until the matter is resolved.",
    ]),
  ],
};

export const accountDeletionPolicy: LegalDocument = {
  id: "account-deletion",
  slug: "account-deletion",
  title: "Account Deletion Policy",
  version: CURRENT_LEGAL_VERSION,
  lastUpdated: "2026-06-09",
  description: "How to delete your YOO account and what happens to your data.",
  sections: [
    section("how-to", "1. How to Request Deletion", [
      "You may request account deletion through Profile → Help & Support → Account Deletion, or email privacy@yoo.app from your registered email with subject 'Account Deletion Request'.",
      "We may verify your identity before processing the request to prevent unauthorized deletion.",
    ]),
    section("timeline", "2. Processing Timeline", [
      "Deletion requests are processed within 30 days. You may cancel a pending deletion by contacting support before processing completes.",
    ]),
    section("deleted", "3. What Is Deleted", [
      "We delete or anonymize profile information, saved places, preferences, push tokens, and active session credentials. Your name and contact identifiers are removed from marketing lists.",
    ]),
    section("retained", "4. What May Be Retained", [
      "We may retain trip history, payment records, driver documents, safety reports, support communications, and legal acceptance logs as required for tax, accounting, fraud prevention, insurance, and compliance with law. Retained data is restricted and not used for marketing.",
    ]),
    section("drivers", "5. Driver Accounts", [
      "Drivers with pending payouts or open disputes must resolve them before deletion. Stripe Connect records may persist with Stripe according to their policies.",
    ]),
    section("after-deletion", "6. After Deletion", [
      "You may create a new account later, but prior trip history and ratings will not automatically transfer. Re-registration requires new acceptance of current legal terms.",
    ]),
  ],
};
