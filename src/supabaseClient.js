import { createClient } from '@supabase/supabase-js'

// 替换为你自己的 Supabase URL 和 Anon Key
const supabaseUrl = 'https://ycsrwpkewxnjzzwzucub.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc3J3cGtld3huanp6d3p1Y3ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MDE4ODMsImV4cCI6MjA5MjE3Nzg4M30.p1Ki-IS2p0aytrR7ffwPtx4nNMQWkjokRK5LHbmJz-U'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)