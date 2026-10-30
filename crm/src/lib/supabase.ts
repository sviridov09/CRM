import { createClient, FunctionsHttpError } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in crm/.env.local')
}

export const supabase = createClient(url, key)

/** Текст ошибки из Edge Function: функция отвечает { error: "..." }. */
export async function functionErrorMessage(error: Error): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json()
      if (body?.error) return String(body.error)
    } catch {
      // тело не JSON — вернём общий текст ниже
    }
  }
  return error.message
}
