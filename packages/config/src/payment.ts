import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export interface CreateOrderInput {
  billId: string;
  societyId: string;
  residentId: string;
  amountPaise: number;
  currency?: string;
  linkedAccountId?: string;
  notes?: Record<string, string>;
}

export interface CreateOrderResult {
  orderId: string;
  providerOrderId: string;
  amountPaise: number;
  currency: string;
}

export interface ParsedWebhookEvent {
  valid: boolean;
  eventId: string;
  event: string;
  paymentId: string;
  orderId: string;
  amountPaise: number;
}

export interface CreateLinkedAccountInput {
  societyId: string;
  businessName: string;
  email: string;
  ifsc: string;
  accountNumber: string;
  accountName: string;
}

export interface CreateLinkedAccountResult {
  linkedAccountId: string;
  status: string;
}

export interface RefundInput {
  paymentId: string;
  amountPaise?: number;
  notes?: Record<string, string>;
}

export interface RefundResult {
  refundId: string;
  status: string;
}

export interface OrderStatusResult {
  status: "captured" | "failed" | "pending";
  paymentId?: string;
  amountPaise: number;
}

export interface PaymentProvider {
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  parseWebhookEvent(rawBody: string, signature: string): ParsedWebhookEvent;
  createLinkedAccount(input: CreateLinkedAccountInput): Promise<CreateLinkedAccountResult>;
  transferToLinkedAccount(linkedAccountId: string, amountPaise: number): Promise<{ transferId: string }>;
  refund(input: RefundInput): Promise<RefundResult>;
  getOrderStatus(providerOrderId: string): Promise<OrderStatusResult>;
}

export class FakePaymentProvider implements PaymentProvider {
  private readonly webhookSecret: string;
  private readonly _capturedOrders = new Map<string, { paymentId: string; amountPaise: number }>();

  constructor(webhookSecret = "fake-webhook-secret-at-least-32ch!") {
    this.webhookSecret = webhookSecret;
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const orderId = randomUUID();
    return {
      orderId,
      providerOrderId: `fake_order_${orderId}`,
      amountPaise: input.amountPaise,
      currency: input.currency ?? "INR",
    };
  }

  parseWebhookEvent(rawBody: string, signature: string): ParsedWebhookEvent {
    const expected = createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
    let valid = false;
    try {
      const expectedBuf = Buffer.from(expected, "hex");
      const sigBuf = Buffer.from(signature, "hex");
      valid = expectedBuf.length === sigBuf.length && timingSafeEqual(expectedBuf, sigBuf);
    } catch {
      valid = false;
    }
    if (!valid) {
      return { valid: false, eventId: "", event: "", paymentId: "", orderId: "", amountPaise: 0 };
    }
    const payload = JSON.parse(rawBody) as {
      eventId: string;
      event: string;
      paymentId: string;
      orderId: string;
      amountPaise: number;
    };
    return {
      valid: true,
      eventId: payload.eventId ?? payload.paymentId,
      event: payload.event,
      paymentId: payload.paymentId,
      orderId: payload.orderId,
      amountPaise: payload.amountPaise,
    };
  }

  async createLinkedAccount(_input: CreateLinkedAccountInput): Promise<CreateLinkedAccountResult> {
    return { linkedAccountId: `fake_acc_${randomUUID()}`, status: "active" };
  }

  async transferToLinkedAccount(_linkedAccountId: string, _amountPaise: number): Promise<{ transferId: string }> {
    return { transferId: `fake_txfr_${randomUUID()}` };
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    return { refundId: `fake_rfnd_${randomUUID()}`, status: "processed" };
  }

  async getOrderStatus(providerOrderId: string): Promise<OrderStatusResult> {
    const captured = this._capturedOrders.get(providerOrderId);
    if (captured) return { status: "captured", paymentId: captured.paymentId, amountPaise: captured.amountPaise };
    return { status: "pending", amountPaise: 0 };
  }

  // Test helper: generate a valid signed webhook payload
  buildWebhook(
    event: string,
    paymentId: string,
    orderId: string,
    amountPaise: number,
  ): { body: string; signature: string } {
    const eventId = randomUUID();
    const body = JSON.stringify({ eventId, event, paymentId, orderId, amountPaise });
    const signature = createHmac("sha256", this.webhookSecret).update(body).digest("hex");
    return { body, signature };
  }

  // Test helper: configure the fake so getOrderStatus returns "captured"
  markOrderCaptured(providerOrderId: string, paymentId: string, amountPaise: number): void {
    this._capturedOrders.set(providerOrderId, { paymentId, amountPaise });
  }
}

export function createPaymentProvider(provider: "fake" | "razorpay", webhookSecret?: string): PaymentProvider {
  switch (provider) {
    case "fake":
      return new FakePaymentProvider(webhookSecret);
    case "razorpay":
      throw new Error("RazorpayProvider not yet implemented; set PAYMENT_PROVIDER=fake for development");
  }
}
