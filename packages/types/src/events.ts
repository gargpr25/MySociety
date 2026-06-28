export type EventType =
  | "bill.generated"
  | "payment.captured"
  | "ticket.created"
  | "ticket.resolved";

export interface BillGeneratedEvent {
  type: "bill.generated";
  societyId: string;
  billId: string;
  unitId: string;
  cycleId: string;
  period: string;
  totalDue: number;
}

export interface PaymentCapturedEvent {
  type: "payment.captured";
  societyId: string;
  paymentId: string;
  residentId: string;
  amountRupees: number;
}

export interface TicketCreatedEvent {
  type: "ticket.created";
  societyId: string;
  ticketId: string;
  category: string;
  ticketType: string;
  unitId: string | null;
}

export interface TicketResolvedEvent {
  type: "ticket.resolved";
  societyId: string;
  ticketId: string;
  category: string;
  ticketType: string;
  unitId: string | null;
}

export type CanonicalEvent =
  | BillGeneratedEvent
  | PaymentCapturedEvent
  | TicketCreatedEvent
  | TicketResolvedEvent;
