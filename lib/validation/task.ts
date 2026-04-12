import { z } from 'zod'

export const TaskCreateSchema = z.object({
  workflow_id: z.string().uuid('workflow_id must be a valid UUID.').nullable().optional(),

  title: z
    .string()
    .min(1, 'Title is required.')
    .max(500, 'Title must not exceed 500 characters.'),

  description: z
    .string()
    .max(2000, 'Description must not exceed 2,000 characters.')
    .nullable()
    .optional(),

  notes: z
    .string()
    .max(2000, 'Notes must not exceed 2,000 characters.')
    .nullable()
    .optional(),

  status: z
    .enum(['todo', 'done', 'blocked'], {
      message: 'Status must be one of: To do, Done, Blocked.',
    })
    .optional(),

  priority: z
    .number()
    .int('Priority must be a whole number.')
    .min(1, 'Priority must be between 1 and 5.')
    .max(5, 'Priority must be between 1 and 5.')
    .optional(),

  due_date: z
    .number()
    .int('Due date must be a valid timestamp.')
    .nullable()
    .optional(),

  defer_date: z
    .number()
    .int('Defer date must be a valid timestamp.')
    .nullable()
    .optional(),

  position_x: z.number().nullable().optional(),
  position_y: z.number().nullable().optional(),
})

export const TaskUpdateSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required.')
    .max(500, 'Title must not exceed 500 characters.')
    .optional(),

  description: z
    .string()
    .max(2000, 'Description must not exceed 2,000 characters.')
    .nullable()
    .optional(),

  notes: z
    .string()
    .max(2000, 'Notes must not exceed 2,000 characters.')
    .nullable()
    .optional(),

  status: z
    .enum(['todo', 'done', 'blocked'], {
      message: 'Status must be one of: To do, Done, Blocked.',
    })
    .optional(),

  priority: z
    .number()
    .int('Priority must be a whole number.')
    .min(1, 'Priority must be between 1 and 5.')
    .max(5, 'Priority must be between 1 and 5.')
    .optional(),

  due_date: z
    .number()
    .int('Due date must be a valid timestamp.')
    .nullable()
    .optional(),

  defer_date: z
    .number()
    .int('Defer date must be a valid timestamp.')
    .nullable()
    .optional(),

  review_date: z
    .number()
    .int('Review date must be a valid timestamp.')
    .nullable()
    .optional(),

  position_x: z.number().nullable().optional(),
  position_y: z.number().nullable().optional(),
  workflow_id: z.string().uuid('workflow_id must be a valid UUID.').nullable().optional(),
})

export type TaskCreate = z.infer<typeof TaskCreateSchema>
export type TaskUpdate = z.infer<typeof TaskUpdateSchema>
