import type { LegalDocument } from "../types";
import { section } from "../buildSection";
import { CURRENT_LEGAL_VERSION } from "../version";

export const termsOfService: LegalDocument = {
  id: "terms",
  slug: "terms",
  title: "Terms of Service",
  version: CURRENT_LEGAL_VERSION,
  lastUpdated: "2026-06-09",
  description: "The binding agreement between you and YOO for use of the Platform.",
  sections: [
    section("acceptance", "1. Acceptance of Terms", [
      'These Terms of Service ("Terms") govern access to and use of the YOO mobile application, website, and related services (collectively, the "Platform") operated by YOO Mobility, Inc. ("YOO," "we," "us").',
      "By creating an account, booking a ride, offering rides as a driver, or otherwise using the Platform, you agree to these Terms, our Privacy Policy, Community Guidelines, and Safety Policy, which are incorporated by reference.",
    ]),
    section("eligibility", "2. Eligibility", [
      "You must be at least 18 years old and legally able to enter a binding contract. Drivers must meet additional eligibility requirements in our Driver Terms & Conditions and complete onboarding approval.",
      "You represent that information you provide is accurate and that you will maintain its accuracy. YOO may suspend or terminate accounts containing false, misleading, or incomplete information.",
    ]),
    section("platform-role", "3. Platform Role & Limitations", [
      "YOO provides a technology platform connecting riders with independent drivers and carpool hosts. YOO is not a transportation carrier, employer of drivers, insurer, or agent of users except as explicitly stated.",
      "We do not guarantee availability of drivers, rides, specific ETAs, uninterrupted service, error-free software, or suitability of any user. Service may be affected by weather, traffic, demand, device connectivity, third-party outages, or force majeure events.",
    ]),
    section("rider-obligations", "4. Rider Obligations", [
      "Riders must provide accurate pickup and drop-off locations, be ready at pickup within reasonable time, treat drivers respectfully, comply with Community Guidelines, pay applicable fares and fees, and not engage in fraudulent chargebacks or false safety reports.",
      "Riders are responsible for their belongings. Minors must not use the Platform unless accompanied by an adult where permitted by local law and Platform rules.",
    ]),
    section("pricing-cancellations", "5. Pricing, Cancellations & Fees", [
      "Fares are calculated based on distance, time, ride mode, vehicle class, demand factors, and applicable promotions. Estimated fares shown before booking may change if the trip materially differs. Future surge pricing may apply during high demand with in-app disclosure before confirmation.",
      "Cancellation Policy: You may cancel before driver assignment without charge in most cases. After a driver is assigned or en route, cancellation fees may apply to compensate drivers for time and distance. Scheduled rides cancelled within the posted window may incur fees.",
      "Wait-Time Fees: If a driver arrives and waits beyond the grace period because the rider is not at the pickup point, wait-time charges may apply.",
      "No-Show Fees: Failure to appear after driver arrival and reasonable contact attempts may be treated as a no-show and charged according to in-app rates.",
      "Shared & Carpool Rides: Fares may be split among passengers. Joining or leaving shared rides may recalculate fares for all participants. Carpool hosts set seat pricing subject to Platform minimums and applicable law.",
      "Payment Authorization: By adding a payment method, you authorize YOO and Stripe to charge fares, fees, tips, tolls, and adjustments to your selected payment method or wallet balance.",
    ]),
    section("ratings", "6. Ratings & Reviews", [
      "After trips, riders and drivers may rate each other. Ratings must be honest and related to the trip experience. YOO may remove ratings that violate guidelines or appear retaliatory, fraudulent, or discriminatory.",
      "Low ratings, safety reports, or policy violations may result in warnings, temporary restrictions, or account termination.",
    ]),
    section("account-actions", "7. Suspension & Termination", [
      "We may suspend or terminate accounts immediately for violations of these Terms, Community Guidelines, Safety Policy, suspected fraud, chargeback abuse, dangerous behavior, or legal requirements. You may close your account at any time subject to outstanding obligations.",
      "Termination does not relieve you of payment obligations for completed trips or chargebacks owed.",
    ]),
    section("disputes", "8. Disputes, Arbitration & Class Waiver", [
      "Contact support@yoo.app before formal disputes. Many issues can be resolved through in-app support.",
      "PLEASE READ CAREFULLY: Except where prohibited by law, you and YOO agree that disputes arising from these Terms or the Platform will be resolved by binding individual arbitration rather than in court, and you waive the right to participate in class actions or class arbitrations.",
      "You may opt out of arbitration within 30 days of account creation by emailing legal@yoo.app with subject 'Arbitration Opt-Out' and your account email.",
      "Nothing limits either party's ability to seek injunctive relief for intellectual property misuse or unauthorized access.",
    ]),
    section("liability", "9. Limitation of Liability & Indemnification", [
      "TO THE MAXIMUM EXTENT PERMITTED BY LAW, YOO AND ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS ARE NOT LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, LOST PROFITS, LOST DATA, PERSONAL INJURY, OR PROPERTY DAMAGE ARISING FROM USE OF THE PLATFORM OR THIRD-PARTY CONDUCT.",
      "YOO'S TOTAL LIABILITY FOR ANY CLAIM ARISING FROM THE PLATFORM SHALL NOT EXCEED THE GREATER OF (A) AMOUNTS YOU PAID YOO IN THE 12 MONTHS BEFORE THE CLAIM OR (B) USD $100.",
      "You agree to indemnify and hold YOO harmless from claims, losses, and expenses (including reasonable attorneys' fees) arising from your use of the Platform, violation of these Terms, violation of law, or infringement of third-party rights.",
    ]),
    section("ip", "10. Intellectual Property", [
      "The Platform, trademarks, logos, software, and content are owned by YOO or licensors. You receive a limited, non-exclusive, non-transferable license to use the app for personal, non-commercial purposes. You may not copy, modify, reverse engineer, or create derivative works except as permitted by law.",
    ]),
    section("changes", "11. Changes", [
      "We may modify these Terms. Material changes will be communicated in-app or by email. Continued use after the effective date constitutes acceptance. If you disagree, stop using the Platform and delete your account.",
    ]),
    section("contact", "12. Contact", [
      "YOO Mobility, Inc. | legal@yoo.app | support@yoo.app",
    ]),
  ],
};
