import { z } from "zod";

export const ticketTypeSchema = z.enum(["complaint", "request"]);
export type TicketType = z.infer<typeof ticketTypeSchema>;

export const ticketCategorySchema = z.enum([
  "electric",
  "plumbing",
  "mason",
  "painting",
  "ac_cleaning",
  "shifting",
  "parking_alloc",
  "playground_alloc",
  "other",
]);
export type TicketCategory = z.infer<typeof ticketCategorySchema>;

export const ticketStatusSchema = z.enum([
  "open",
  "assigned",
  "in_progress",
  "resolved",
  "closed",
  "reopened",
]);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const ticketPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;

export const createTicketSchema = z.object({
  unitId: z.string().uuid().optional(),
  type: ticketTypeSchema,
  category: ticketCategorySchema,
  description: z.string().min(10).max(2000),
  priority: ticketPrioritySchema.default("normal"),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketStatusSchema = z.object({
  status: z.enum(["in_progress", "resolved", "closed", "reopened"]),
  comment: z.string().max(500).optional(),
});
export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;

export const assignTicketSchema = z.object({
  assignedTo: z.string().uuid(),
  comment: z.string().max(500).optional(),
});
export type AssignTicketInput = z.infer<typeof assignTicketSchema>;

export const addCommentSchema = z.object({
  body: z.string().min(1).max(2000),
});
export type AddCommentInput = z.infer<typeof addCommentSchema>;

export const listTicketsQuerySchema = z.object({
  status: ticketStatusSchema.optional(),
  category: ticketCategorySchema.optional(),
  type: ticketTypeSchema.optional(),
  assignedTo: z.string().uuid().optional(),
});
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
