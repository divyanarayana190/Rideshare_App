import twilio from "twilio";
import logger from "../logger";

// Initialize Twilio client
const getTwilioClient = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    logger.warn("[Twilio] Missing credentials - SMS/calling features disabled");
    return null;
  }

  return twilio(accountSid, authToken);
};

const getVerifyClient = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;

  if (!accountSid || !authToken) {
    logger.warn("[Twilio] Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN — Verify disabled");
    return null;
  }
  if (!verifySid) {
    logger.warn("[Twilio] Missing TWILIO_VERIFY_SERVICE_SID — Verify disabled");
    return null;
  }

  return twilio(accountSid, authToken).verify.v2.services(verifySid);
};

// ============================================================================
// SMS Functions
// ============================================================================

export async function sendSMS(toPhoneNumber: string, message: string): Promise<boolean> {
  try {
    const client = getTwilioClient();
    if (!client) return false;

    const fromPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!fromPhoneNumber) {
      logger.warn("[Twilio SMS] Missing TWILIO_PHONE_NUMBER");
      return false;
    }

    const result = await client.messages.create({
      body: message,
      from: fromPhoneNumber,
      to: toPhoneNumber,
    });

    logger.info({ to: toPhoneNumber, sid: result.sid }, "[Twilio SMS] Sent");
    return true;
  } catch (error) {
    logger.error({ err: error }, "[Twilio SMS] Error");
    return false;
  }
}

export async function sendRideNotification(
  toPhoneNumber: string,
  rideInfo: {
    driverName: string;
    driverPhone: string;
    pickupTime: string;
    pickupAddress: string;
    dropoffAddress: string;
    fare: number;
  }
): Promise<boolean> {
  const message = `
🚗 Your YOO is here!
Driver: ${rideInfo.driverName}
Call: ${rideInfo.driverPhone}
Pickup: ${rideInfo.pickupTime}
From: ${rideInfo.pickupAddress}
To: ${rideInfo.dropoffAddress}
Fare: $${rideInfo.fare.toFixed(2)}
  `.trim();

  return sendSMS(toPhoneNumber, message);
}

export async function sendPickupReminder(
  toPhoneNumber: string,
  rideInfo: { driverName: string; pickupTime: string; pickupAddress: string }
): Promise<boolean> {
  const message = `
Reminder: Your ride with ${rideInfo.driverName} is arriving in 5 minutes at ${rideInfo.pickupAddress}
  `.trim();

  return sendSMS(toPhoneNumber, message);
}

export async function sendPaymentConfirmation(
  toPhoneNumber: string,
  paymentInfo: { amount: number; rideId: string; date: string }
): Promise<boolean> {
  const message = `
✅ Payment confirmed for ride ${paymentInfo.rideId}
Amount: $${paymentInfo.amount.toFixed(2)}
Date: ${paymentInfo.date}
Thank you for using YOO!
  `.trim();

  return sendSMS(toPhoneNumber, message);
}

// ============================================================================
// Phone Verification Functions
// ============================================================================

export async function sendVerificationCode(
  to: string,
  channel: "sms" | "email" = "sms",
): Promise<boolean> {
  try {
    const verifyService = getVerifyClient();
    if (!verifyService) return false;

    const verification = await verifyService.verifications.create({ to, channel });

    logger.info({ to, channel, sid: verification.sid }, "[Twilio Verify] Verification sent");
    return true;
  } catch (error) {
    logger.error({ err: error, channel }, "[Twilio Verify] Error sending code");
    return false;
  }
}

/** Verify a code for any channel (sms or email). */
export async function verifyCode(to: string, code: string): Promise<boolean> {
  try {
    const verifyService = getVerifyClient();
    if (!verifyService) return false;

    const check = await verifyService.verificationChecks.create({ to, code });

    if (check.status === "approved") {
      logger.info({ to }, "[Twilio Verify] Approved");
      return true;
    }

    logger.warn({ to, status: check.status }, "[Twilio Verify] Not approved");
    return false;
  } catch (error) {
    logger.error({ err: error }, "[Twilio Verify] Error verifying code");
    return false;
  }
}

/** @deprecated use verifyCode */
export async function verifyPhoneCode(toPhoneNumber: string, code: string): Promise<boolean> {
  return verifyCode(toPhoneNumber, code);
}

// ============================================================================
// Call Functions
// ============================================================================

export async function initiateCall(
  toPhoneNumber: string,
  callbackUrl: string
): Promise<string | null> {
  try {
    const client = getTwilioClient();
    if (!client) return null;

    const fromPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!fromPhoneNumber) {
      logger.warn("[Twilio Call] Missing TWILIO_PHONE_NUMBER");
      return null;
    }

    const call = await client.calls.create({
      url: callbackUrl,
      to: toPhoneNumber,
      from: fromPhoneNumber,
      record: true, // Record calls for safety
    });

    logger.info({ to: toPhoneNumber, sid: call.sid }, "[Twilio Call] Initiated call");
    return call.sid;
  } catch (error) {
    logger.error({ err: error }, "[Twilio Call] Error initiating call");
    return null;
  }
}

export async function getCallStatus(callSid: string): Promise<string | null> {
  try {
    const client = getTwilioClient();
    if (!client) return null;

    const call = await client.calls(callSid).fetch();
    return call.status;
  } catch (error) {
    logger.error({ err: error }, "[Twilio Call] Error fetching call status");
    return null;
  }
}

export async function endCall(callSid: string): Promise<boolean> {
  try {
    const client = getTwilioClient();
    if (!client) return false;

    await client.calls(callSid).update({ status: "completed" });
    logger.info({ sid: callSid }, "[Twilio Call] Ended call");
    return true;
  } catch (error) {
    logger.error({ err: error }, "[Twilio Call] Error ending call");
    return false;
  }
}

// ============================================================================
// Callback XML Generators (for TwiML responses)
// ============================================================================

export function generateCallTwiML(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${message}</Say>
  <Gather numDigits="1" action="/api/twilio/gather" method="POST">
    <Say>Press 1 to accept, 2 to decline</Say>
  </Gather>
</Response>`;
}

export function generateConnectTwiML(phoneNumber: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>${phoneNumber}</Dial>
</Response>`;
}
