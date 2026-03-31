import { z } from 'zod'

export const TaskCreateSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required.')
    .max(500, 'Title must not exceed 500 characters.'),

  end_goal: z
    .string()
    .max(2000, 'End goal must not exceed 2,000 characters.')
    .optional(),

  description: z
    .string()
    .max(2000, 'Description must not exceed 2,000 characters.')
    .optional(),

  notes: z
    .string()
    .max(2000, 'Notes must not exceed 2,000 characters.')
    .optional(),

  status: z
    .enum(['todo', 'in_progress', 'done', 'blocked'], {
      message: 'Status must be one of: To do, In progress, Done, Blocked.',
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
})

export const TaskUpdateSchema = TaskCreateSchema.partial()

export type TaskCreate = z.infer<typeof TaskCreateSchema>
export type TaskUpdate = z.infer<typeof TaskUpdateSchema>
