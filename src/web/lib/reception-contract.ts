import { z } from "zod";
export const contactSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[^\r\n<>]+$/),
    email: z.email().max(200),
    subject: z
      .string()
      .trim()
      .min(3)
      .max(120)
      .regex(/^[^\r\n]+$/),
    message: z.string().trim().min(10).max(3000),
    confirmed: z.literal(true),
  })
  .strict();
export const receptionReplySchema = z
  .object({
    reply: z.string().min(1).max(1600),
    action: z.enum(["none", "access_code", "navigate", "contact"]),
    destination: z
      .enum(["home", "examples", "alphabet", "microsoft", "research"])
      .nullable(),
    in_scope: z.boolean(),
  })
  .strict();
export const receptionResultSchema = receptionReplySchema.extend({
  code: z
    .string()
    .regex(/^OW-[A-F0-9]{24}$/)
    .optional(),
  remainingUses: z.number().int().min(0).max(2).optional(),
  existing: z.boolean().optional(),
  emailAvailable: z.boolean().optional(),
});
export type ReceptionReply = z.infer<typeof receptionResultSchema>;
