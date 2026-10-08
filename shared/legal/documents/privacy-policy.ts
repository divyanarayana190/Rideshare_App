import type { LegalDocument } from "../types";
import { section } from "../buildSection";
import { CURRENT_LEGAL_VERSION } from "../version";

const EFFECTIVE = "2026-06-09";

export const privacyPolicy: LegalDocument = {
  id: "privacy",
  slug: "privacy",
  title: "Privacy Policy",
  version: CURRENT_LEGAL_VERSION,
  lastUpdated: EFFECTIVE,
  description: "How YOO collects, uses, shares, and protects your personal information.",
  sections: [
    section("introduction", "1. Introduction", [
      'YOO Mobility, Inc. ("YOO," "we," "us," or "our") operates the YOO mobile application and related services (the "Platform"), which provides on-demand rideshare, scheduled rides, and carpool marketplace features.',
      "This Privacy Policy explains what information we collect, why we collect it, how we use and share it, how long we retain it, and the choices and rights available to you. By creating an account or using the Platform, you acknowledge this Policy and our data practices described herein.",
      "If you do not agree with this Privacy Policy, do not use the Platform.",
    ]),
    section("information-we-collect", "2. Information We Collect", [
      "We collect information you provide directly, information generated through your use of the Platform, and information from third-party integrations necessary to operate a transportation marketplace.",
      "Account Information: name, email address, phone number, password hash (if applicable), profile photo, gender (optional), student status, college email, emergency contacts, and account preferences.",
      "Verification Information: one-time passcodes (OTP) sent to your phone or email for authentication; driver onboarding documents including driver's license, vehicle registration, insurance certificate, profile photo, and bank account last-four digits for payouts.",
      "Ride Information: pickup and drop-off addresses and coordinates, route polylines, scheduled departure times, ride mode (solo, shared, carpool), fare estimates and final fares, cancellation records, ratings, messages between riders and drivers, and carpool join requests.",
      "Location Information: foreground and background precise location when you grant permission. Riders may share live trip location with trusted contacts. Drivers share live location while online and during active trips for dispatch, navigation, ETA calculation, route optimization, geofencing, and safety monitoring.",
      "Payment Information: payment method tokens and metadata processed by Stripe (we do not store full card numbers on YOO servers), transaction history, refunds, wallet balances, tips, and driver payout records via Stripe Connect.",
      "Technical Information: device type, operating system, app version, IP address, push notification tokens, crash reports, diagnostic logs, session identifiers, and product analytics events used to improve reliability and security.",
    ]),
    section("how-we-collect", "3. How We Collect Information", [
      "We collect information when you register, verify your identity, book or offer rides, communicate through in-app chat, contact support, participate in promotions, or interact with safety features such as SOS.",
      "Location data is collected through your device GPS and motion sensors when you enable location permissions. Background location for drivers enables continuous dispatch matching and passenger tracking during active trips.",
      "We also receive information from service providers such as Stripe (payments), Google Maps Platform (geocoding, routing, maps display), Twilio (SMS OTP), cloud hosting providers, and fraud-prevention tools.",
    ]),
    section("why-we-use", "4. Why We Use Your Information", [
      "We use personal information to provide, maintain, and improve the Platform; match riders with drivers; calculate fares; process payments and driver payouts; send transactional notifications; verify student and driver eligibility; enforce Community Guidelines; investigate safety incidents; comply with law; and prevent fraud.",
      "Location data is used to show nearby drivers, estimate arrival times, navigate trips, detect route deviations, trigger geofenced ride state changes (e.g., driver arrived), and support emergency response when you use safety features.",
      "We may use aggregated or de-identified data for analytics, service optimization, and reporting that does not identify you personally.",
    ]),
    section("sharing", "5. How We Share Information", [
      "During an active trip, riders and assigned drivers receive limited profile and location information necessary to complete the ride (name, photo, rating, vehicle details, live location).",
      "We share information with payment processors (Stripe), mapping providers (Google), communications providers (Twilio, Expo push notification services), cloud infrastructure hosts, and customer support tools under contractual obligations to protect your data.",
      "We may disclose information when required by law, subpoena, or governmental request; to protect the rights, property, or safety of YOO, our users, or the public; or in connection with a merger, acquisition, or asset sale with appropriate notice where required.",
      "We do not sell your personal information for money. We do not share personal information with third parties for their independent marketing without your consent.",
    ]),
    section("yoo-specific", "6. YOO-Specific Features & Disclosures", [
      "Women-Only / Safety Mode Rides: When you enable gender-based or safety matching preferences, we use profile gender and ride preferences to facilitate compatible matching. Matching is based on self-reported information and platform rules; YOO does not guarantee the identity or conduct of any user.",
      "Student Verification: If you verify a .edu or institutional email, we store verification status, masked email, university domain, and OTP verification records to administer student promotions. Student status does not guarantee enrollment and may be revoked upon failed reverification.",
      "Driver Background Checks: Driver applicants submit identity and vehicle documentation for administrative review. YOO's verification process is not a substitute for government-run criminal background checks unless explicitly stated in your jurisdiction. Approval does not guarantee future conduct.",
      "GPS & Real-Time Location Sharing: By using driver mode or active ride features, you consent to continuous location collection and sharing with matched parties for the duration of the service session. You may disable location permissions in device settings, but core features may not function.",
      "Emergency Contacts: If you add emergency contacts, we may use them to notify designated individuals during safety incidents or SOS activations you initiate.",
      "Ride Recording: YOO does not audio- or video-record trips by default. If in-vehicle recording features are introduced in the future, we will provide separate notice and consent mechanisms before activation.",
    ]),
    section("retention", "7. Data Retention", [
      "We retain personal information for as long as your account is active and as needed to provide services, resolve disputes, enforce agreements, and comply with legal obligations. See our Data Retention Policy for category-specific periods.",
      "Trip records, payment records, and safety incident records may be retained longer where required for tax, insurance, regulatory, or litigation purposes.",
      "When you delete your account, we begin deletion or anonymization within our published timelines, subject to lawful retention exceptions.",
    ]),
    section("your-rights", "8. Your Rights & Choices", [
      "You may access and update profile information in the app, manage notification preferences, control location permissions at the device level, and request account deletion through Help & Support or privacy@yoo.app.",
      "Depending on your location, you may have additional rights including access, correction, deletion, portability, restriction, objection, and withdrawal of consent. We will verify requests before fulfilling them.",
      "California Residents (CCPA/CPRA): You have the right to know categories of personal information collected, sources, purposes, and third parties; to delete personal information subject to exceptions; to correct inaccurate information; to opt out of sale/sharing (YOO does not sell personal information); and to non-discrimination for exercising privacy rights. Submit requests to privacy@yoo.app.",
      "EEA/UK (GDPR): Legal bases include contract performance, legitimate interests (fraud prevention, safety, product improvement), consent (where required, e.g., marketing), and legal obligation. You may lodge a complaint with your supervisory authority. Contact privacy@yoo.app for data subject requests.",
      "International Users: YOO is operated from the United States. By using the Platform outside the U.S., you consent to transfer and processing in the U.S. and other countries that may have different data protection laws.",
    ]),
    section("security", "9. Security", [
      "We implement administrative, technical, and organizational measures including encryption in transit (TLS), access controls, secure password hashing, tokenized payments via Stripe, and monitoring for unauthorized access.",
      "No method of transmission or storage is 100% secure. Report suspected unauthorized access to privacy@yoo.app immediately.",
    ]),
    section("children", "10. Children's Privacy", [
      "The Platform is not directed to individuals under 18. We do not knowingly collect personal information from children. If you believe a minor has provided information, contact privacy@yoo.app and we will delete it.",
    ]),
    section("changes", "11. Changes to This Policy", [
      "We may update this Privacy Policy from time to time. Material changes will be notified via in-app notice, email, or push notification. Continued use after the effective date constitutes acceptance unless prohibited by law. Version history is maintained in the app Legal Center.",
    ]),
    section("contact", "12. Contact Us", [
      "YOO Mobility, Inc.",
      "Privacy inquiries: privacy@yoo.app",
      "Legal inquiries: legal@yoo.app",
      "Data protection requests: privacy@yoo.app (subject: Privacy Request)",
    ]),
  ],
};
