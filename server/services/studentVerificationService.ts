/**
 * Student Verification Service
 *
 * Responsibilities:
 *  - Validate that an email is a genuine .edu address (not disposable/malformed)
 *  - Derive a human-readable university name from the email domain
 *  - Generate cryptographically secure 6-digit OTPs
 *  - Hash / verify OTPs using bcrypt (stored hash, never the plain OTP)
 */

import crypto from "crypto";
import bcrypt from "bcryptjs";

// ── Email validation ──────────────────────────────────────────────────────────

/**
 * Well-known disposable / free-mail services that fraudulently use .edu-style names.
 * Extend this list as needed.
 */
const BLOCKED_DOMAINS = new Set([
  "guerrillamail.com",
  "mailinator.com",
  "tempmail.com",
  "throwaway.email",
  "trashmail.com",
  "yopmail.com",
  "sharklasers.com",
  "guerrillamailblock.com",
  "grr.la",
  "dispostable.com",
  "fakeinbox.com",
]);

/**
 * Returns true when the email is a syntactically valid .edu address and is
 * not on the blocked-domain list.
 */
export function isEduEmail(email: string): boolean {
  const normalised = email.trim().toLowerCase();

  // Basic RFC-5321 shape: local@domain
  const atIdx = normalised.lastIndexOf("@");
  if (atIdx < 1) return false;

  const local = normalised.slice(0, atIdx);
  const domain = normalised.slice(atIdx + 1);

  if (!local || !domain) return false;
  if (local.length > 64 || domain.length > 255) return false;

  // Must end with .edu
  if (!domain.endsWith(".edu")) return false;

  // Domain must contain at least one subdomain label beyond the TLD
  // e.g. "njit.edu" passes, ".edu" alone fails
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((l) => l.length === 0)) return false;

  if (BLOCKED_DOMAINS.has(domain)) return false;

  // Reject obviously malformed local parts (must contain at least one alphanumeric)
  if (!/[a-z0-9]/i.test(local)) return false;

  return true;
}

// ── University name inference ─────────────────────────────────────────────────

/**
 * Known university domain → human-readable name mapping.
 * The server falls back to a title-cased derivation for unknown domains.
 */
const KNOWN_UNIVERSITIES: Record<string, string> = {
  "njit.edu": "New Jersey Institute of Technology",
  "mit.edu": "Massachusetts Institute of Technology",
  "harvard.edu": "Harvard University",
  "stanford.edu": "Stanford University",
  "yale.edu": "Yale University",
  "princeton.edu": "Princeton University",
  "columbia.edu": "Columbia University",
  "cornell.edu": "Cornell University",
  "dartmouth.edu": "Dartmouth College",
  "upenn.edu": "University of Pennsylvania",
  "brown.edu": "Brown University",
  "caltech.edu": "California Institute of Technology",
  "cmu.edu": "Carnegie Mellon University",
  "gatech.edu": "Georgia Institute of Technology",
  "umich.edu": "University of Michigan",
  "ucla.edu": "University of California, Los Angeles",
  "berkeley.edu": "University of California, Berkeley",
  "ucsd.edu": "University of California, San Diego",
  "uci.edu": "University of California, Irvine",
  "ucsb.edu": "University of California, Santa Barbara",
  "nyu.edu": "New York University",
  "bu.edu": "Boston University",
  "northeastern.edu": "Northeastern University",
  "tufts.edu": "Tufts University",
  "bc.edu": "Boston College",
  "rutgers.edu": "Rutgers University",
  "psu.edu": "Pennsylvania State University",
  "wisc.edu": "University of Wisconsin–Madison",
  "umn.edu": "University of Minnesota",
  "uchicago.edu": "University of Chicago",
  "purdue.edu": "Purdue University",
  "indiana.edu": "Indiana University",
  "illinois.edu": "University of Illinois Urbana-Champaign",
  "ufl.edu": "University of Florida",
  "usc.edu": "University of Southern California",
  "duke.edu": "Duke University",
  "vanderbilt.edu": "Vanderbilt University",
  "emory.edu": "Emory University",
  "gt.edu": "Georgia Tech",
  "uga.edu": "University of Georgia",
  "fsu.edu": "Florida State University",
  "asu.edu": "Arizona State University",
  "arizona.edu": "University of Arizona",
  "colorado.edu": "University of Colorado Boulder",
  "utah.edu": "University of Utah",
  "washington.edu": "University of Washington",
  "oregonstate.edu": "Oregon State University",
  "uoregon.edu": "University of Oregon",
  "temple.edu": "Temple University",
  "drexel.edu": "Drexel University",
  "villanova.edu": "Villanova University",
  "lehigh.edu": "Lehigh University",
  "sju.edu": "Saint Joseph's University",
  "fordham.edu": "Fordham University",
  "cuny.edu": "City University of New York",
  "qc.cuny.edu": "Queens College, CUNY",
  "bcc.cuny.edu": "Bronx Community College, CUNY",
  "jhu.edu": "Johns Hopkins University",
  "umd.edu": "University of Maryland",
  "gmu.edu": "George Mason University",
  "vt.edu": "Virginia Tech",
  "wm.edu": "College of William & Mary",
  "unc.edu": "University of North Carolina at Chapel Hill",
  "ncsu.edu": "NC State University",
  "wfu.edu": "Wake Forest University",
  "clemson.edu": "Clemson University",
  "sc.edu": "University of South Carolina",
  "rice.edu": "Rice University",
  "tamu.edu": "Texas A&M University",
  "utexas.edu": "University of Texas at Austin",
  "uh.edu": "University of Houston",
  "ohio.edu": "Ohio University",
  "osu.edu": "The Ohio State University",
  "miami.edu": "University of Miami",
  "fiu.edu": "Florida International University",
  "usf.edu": "University of South Florida",
  "ucf.edu": "University of Central Florida",
  "fau.edu": "Florida Atlantic University",
  "kent.edu": "Kent State University",
  "buffalo.edu": "University at Buffalo, SUNY",
  "stonybrook.edu": "Stony Brook University, SUNY",
  "rpi.edu": "Rensselaer Polytechnic Institute",
  "stevens.edu": "Stevens Institute of Technology",
  "rowan.edu": "Rowan University",
  "montclair.edu": "Montclair State University",
  "kean.edu": "Kean University",
  "shu.edu": "Seton Hall University",
  "drew.edu": "Drew University",
  "tcnj.edu": "The College of New Jersey",
  "rider.edu": "Rider University",
};

export interface UniversityInfo {
  name: string;
  domain: string;
}

export function getUniversityInfo(email: string): UniversityInfo {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";

  if (KNOWN_UNIVERSITIES[domain]) {
    return { name: KNOWN_UNIVERSITIES[domain], domain };
  }

  // Derive readable name from domain: "njcu.edu" → "Njcu University"
  const withoutTld = domain.replace(/\.edu$/, "");
  const labels = withoutTld.split(".");
  const mainLabel = labels[labels.length - 1] ?? withoutTld;
  const name =
    mainLabel.charAt(0).toUpperCase() +
    mainLabel.slice(1) +
    " University";

  return { name, domain };
}

// ── OTP ───────────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 10;

/** Generate a cryptographically secure 6-digit OTP string. */
export function generateOtp(): string {
  // crypto.randomInt is CSPRNG — avoids Math.random() bias
  return crypto.randomInt(100_000, 999_999).toString();
}

/** Hash OTP with bcrypt for safe storage. */
export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, BCRYPT_ROUNDS);
}

/** Constant-time comparison via bcrypt. */
export async function verifyOtp(plainOtp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainOtp, hash);
}

// ── Constants shared across the router and this service ──────────────────────

/** OTP validity window in milliseconds (5 minutes). */
export const OTP_TTL_MS = 5 * 60 * 1000;

/** Minimum seconds between resend requests (60 s cooldown). */
export const RESEND_COOLDOWN_MS = 60 * 1_000;

/** Maximum failed verification attempts before the record is locked. */
export const MAX_VERIFY_ATTEMPTS = 5;
