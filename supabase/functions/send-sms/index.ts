import { Webhook } from "npm:standardwebhooks@1.0.0";

type SendSmsHookPayload = {
  user?: { phone?: unknown };
  sms?: { otp?: unknown };
};

const SOLAPI_ENDPOINT = "https://api.solapi.com/messages/v4/send-many/detail";

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = verifyHookPayload(
      await request.text(),
      Object.fromEntries(request.headers),
      requiredEnv("SEND_SMS_HOOK_SECRET"),
    );
    const phone = toSolapiPhone(payload.user?.phone);
    const otp = requireOtp(payload.sms?.otp);

    await sendSolapiSms({
      apiKey: requiredEnv("SOLAPI_API_KEY"),
      apiSecret: requiredEnv("SOLAPI_API_SECRET"),
      from: digitsOnly(requiredEnv("SOLAPI_SENDER")),
      to: phone,
      text: `[캐치캐치] 인증번호는 ${otp}입니다.`,
    });

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "SMS hook failed");
    return new Response(JSON.stringify({ error: "SMS delivery failed" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});

function verifyHookPayload(
  body: string,
  headers: Record<string, string>,
  configuredSecret: string,
): SendSmsHookPayload {
  const secret = configuredSecret.replace(/^v1,whsec_/, "");
  return new Webhook(secret).verify(body, headers) as SendSmsHookPayload;
}

function toSolapiPhone(value: unknown): string {
  if (typeof value !== "string") throw new Error("Hook phone is missing");
  const digits = value.replace(/\D/g, "");
  if (/^8210\d{8}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^010\d{8}$/.test(digits)) return digits;
  throw new Error("Only Korean mobile numbers are supported");
}

function requireOtp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{6}$/.test(value)) {
    throw new Error("Hook OTP is invalid");
  }
  return value;
}

function digitsOnly(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 11) {
    throw new Error("SOLAPI sender is invalid");
  }
  return digits;
}

async function sendSolapiSms(input: {
  apiKey: string;
  apiSecret: string;
  from: string;
  to: string;
  text: string;
}): Promise<void> {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replaceAll("-", "");
  const signature = await hmacSha256(input.apiSecret, `${date}${salt}`);
  const response = await fetch(SOLAPI_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `HMAC-SHA256 apiKey=${input.apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ to: input.to, from: input.from, text: input.text, type: "SMS" }],
      showMessageList: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`SOLAPI request failed with status ${response.status}`);
  }

  const result = await response.json() as {
    failedMessageList?: unknown[];
    messageList?: Array<{ statusCode?: string }>;
  };
  if (result.failedMessageList?.length || result.messageList?.[0]?.statusCode !== "2000") {
    throw new Error("SOLAPI did not accept the SMS message");
  }
}

async function hmacSha256(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
