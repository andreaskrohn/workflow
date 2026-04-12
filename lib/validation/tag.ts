import { z } from 'zod'

export const TagCreateSchema = z.object({
  name: z
    .string()
    .min(1, 'Tag name is required.')
    .max(50, 'Tag name must not exceed 50 characters.'),
})

export type TagCreate = z.infer<typeof TagCreateSchema>
