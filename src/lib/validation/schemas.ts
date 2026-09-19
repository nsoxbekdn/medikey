import { z } from "zod";

export const shareItemSchema = z.object({
  documentId: z.string().uuid().optional(),
  sanitizedArtifactId: z.string().uuid().optional(),
  vitalsDatasetId: z.string().uuid().optional(),
  selectedMetrics: z.array(z.string()).optional(),
  wrappedAccessKey: z.string().min(1),
  wrappingIv: z.string().min(1),
  encryptedStoragePath: z.string().min(1).optional(),
  encryptionIv: z.string().min(1).optional(),
});

export const createShareSchema = z.object({
  providerLabel: z.string().min(1).max(200),
  providerType: z.string().min(1).max(100),
  purpose: z.string().min(1).max(200),
  expiresAt: z.string().datetime(),
  oneTime: z.boolean().default(false),
  items: z.array(shareItemSchema).min(1),
});

export const accessEventSchema = z.object({
  eventType: z.enum([
    "SHARE_CREATED",
    "SHARE_OPENED",
    "PAYLOAD_RETRIEVED",
    "DECRYPTION_CONFIRMED",
    "SHARE_REVOKED",
    "SHARE_EXPIRED",
    "ONE_TIME_CONSUMED",
  ]),
  actorType: z.enum(["patient", "provider", "system"]),
});

export const vitalsMappingFieldSchema = z.enum([
  "timestamp",
  "systolic",
  "diastolic",
  "heartRate",
  "glucose",
  "spo2",
  "weight",
]);

export const vitalsUploadSchema = z.object({
  name: z.string().min(1).max(120),
  mapping: z.record(vitalsMappingFieldSchema, z.string()),
});

export const aiQuerySchema = z.object({
  question: z.string().min(1).max(1000),
  sanitizedContext: z
    .array(z.object({ sourceId: z.string(), text: z.string() }))
    .min(1)
    .max(20),
});

// Route params are untrusted; reject non-UUID share ids before they reach Postgres.
export const shareIdSchema = z.string().uuid();
