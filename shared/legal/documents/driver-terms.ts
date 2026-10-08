import type { LegalDocument } from "../types";
import { section } from "../buildSection";
import { CURRENT_LEGAL_VERSION } from "../version";

export const driverTerms: LegalDocument = {
  id: "driver-terms",
  slug: "driver-terms",
  title: "Driver Terms & Conditions",
  version: CURRENT_LEGAL_VERSION,
  lastUpdated: "2026-06-09",
  description: "Additional terms governing drivers on the YOO Platform.",
  sections: [
    section("relationship", "1. Independent Contractor Relationship", [
      "Drivers using YOO are independent contractors, not employees, partners, joint venturers, or agents of YOO. Nothing in these Driver Terms creates an employment relationship.",
      "Drivers control when and whether to go online, which requests to accept, and their own work schedule, subject to Platform policies and applicable law. Drivers are responsible for their own taxes, insurance, licenses, and business expenses.",
    ]),
    section("eligibility", "2. Driver Eligibility & Onboarding", [
      "To drive on YOO you must complete onboarding, submit accurate identity and vehicle documentation, pass administrative review, maintain valid driver's license and registration, and satisfy minimum age and driving experience requirements for your jurisdiction.",
      "Background Verification Disclaimer: YOO reviews submitted documents and may use third-party verification tools. Unless explicitly stated for your market, YOO does not guarantee comprehensive criminal background screening equivalent to government licensing. Approval may be revoked if information is false or outdated.",
    ]),
    section("vehicle-insurance", "3. Vehicle & Insurance Requirements", [
      "Drivers must maintain a roadworthy vehicle meeting Platform standards, valid registration, current inspection where required, and auto insurance meeting or exceeding minimum limits required by local law and YOO policy.",
      "Commercial or rideshare endorsements may be required in your jurisdiction. You agree to provide proof of insurance upon request and notify YOO of lapses or claims that affect eligibility.",
    ]),
    section("responsibilities", "4. Driver Responsibilities", [
      "While online or completing trips, drivers must obey traffic laws, maintain valid credentials, keep vehicle clean and safe, follow GPS navigation reasonably, arrive promptly, confirm passenger identity, ensure seatbelt use, and complete trips only through the Platform.",
      "Drivers must not discriminate against riders based on protected characteristics except where permitted by law for safety-matching features explicitly chosen by riders.",
    ]),
    section("location-consent", "5. GPS Tracking & Location Sharing", [
      "By going online, you consent to collection and sharing of your precise location with YOO, prospective passengers, and active passengers for dispatch, ETA, navigation, safety, and fraud prevention.",
      "Disabling location services may prevent you from receiving requests or completing trips.",
    ]),
    section("earnings", "6. Earnings, Payouts & Fees", [
      "Fares displayed to riders may differ from driver earnings after Platform service fees, payment processing, promotions, tolls, tips, adjustments, or chargebacks. Earnings estimates are not guarantees.",
      "Payouts are processed through Stripe Connect to your designated payout method subject to verification, minimum thresholds, and banking timelines. YOO may withhold payouts during fraud investigations or chargeback disputes.",
      "Drivers are solely responsible for reporting and paying applicable income taxes. YOO may issue tax forms where required by law.",
    ]),
    section("cancellations", "7. Driver Cancellations & No-Shows", [
      "Excessive cancellations, failure to progress ride states accurately, or abandoning assigned trips may reduce dispatch priority, trigger penalties, or result in deactivation.",
      "If you cannot complete a trip, cancel through the app promptly so riders can request another driver.",
    ]),
    section("conduct", "8. Prohibited Conduct", [
      "Drivers must not harass passengers, solicit off-platform payments, use another person's account, operate under the influence of drugs or alcohol, carry unauthorized weapons, tamper with GPS, manipulate fares, or allow unauthorized drivers to operate under their profile.",
    ]),
    section("suspension", "9. Suspension & Deactivation", [
      "YOO may suspend or deactivate driver access immediately for safety incidents, low ratings, document expiration, insurance lapse, fraud, or Community Guidelines violations. Some deactivations may be permanent.",
    ]),
    section("acceptance", "10. Acceptance", [
      "By toggling Driver Mode or accepting ride requests, you agree to these Driver Terms in addition to the Terms of Service, Privacy Policy, Community Guidelines, and Safety Policy.",
      "Questions: legal@yoo.app",
    ]),
  ],
};
