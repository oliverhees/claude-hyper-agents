import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

// ============================================
// ENVIRONMENT VALIDATION
// ============================================
const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
});

function getEnv() {
  const result = envSchema.safeParse({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
  });
  
  if (!result.success) {
    throw new Error(`Missing environment variables: ${result.error.message}`);
  }
  return result.data;
}

// ============================================
// DATABASE TYPES
// ============================================
export type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed' | 'archived';
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'blocked' | 'done';
export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';
export type LearningCategory = 'bug' | 'architecture' | 'performance' | 'security' | 'ux' | 'process' | 'other';
export type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type ContentStatus = 'draft' | 'scheduled' | 'posted' | 'failed';
export type ContentPlatform = 'twitter' | 'linkedin' | 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'pinterest' | 'threads';
export type ContentType = 'post' | 'thread' | 'story' | 'reel' | 'video' | 'article' | 'newsletter';

// ============================================
// TABLE INTERFACES
// ============================================
export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  template: string | null;
  tech_stack: Record<string, unknown>;
  settings: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Roadmap {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  milestones: unknown[];
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  roadmap_id: string | null;
  parent_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: PriorityLevel;
  assigned_team: string | null;
  assigned_agent: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  blocked_by: string[] | null;
  blocker_reason: string | null;
  deliverable_path: string | null;
  deliverables: unknown[];
  tags: string[];
  metadata: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Learning {
  id: string;
  project_id: string | null;
  title: string;
  problem: string;
  solution: string;
  context: string | null;
  category: LearningCategory;
  tags: string[];
  severity: PriorityLevel | null;
  related_task_ids: string[] | null;
  related_files: string[] | null;
  code_snippets: unknown[];
  team: string | null;
  created_by: string | null;
  search_vector: string | null;
  created_at: string;
}

export interface LearningEmbedding {
  id: string;
  learning_id: string;
  content_hash: string;
  qdrant_point_id: string | null;
  embedding_model: string;
  synced_at: string;
}

export interface Meeting {
  id: string;
  project_id: string | null;
  title: string;
  topic: string;
  agenda: unknown[];
  participants: string[];
  initiated_by: string | null;
  status: MeetingStatus;
  scheduled_for: string | null;
  started_at: string | null;
  ended_at: string | null;
  transcript: TranscriptEntry[];
  summary: string | null;
  decisions: unknown[];
  action_items: unknown[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface TranscriptEntry {
  speaker: string;
  message: string;
  timestamp: string;
}

export interface ActivityLog {
  id: string;
  project_id: string | null;
  team: string | null;
  agent: string;
  action: string;
  details: Record<string, unknown>;
  related_id: string | null;
  related_type: string | null;
  created_at: string;
}

export interface ContentCalendar {
  id: string;
  project_id: string;
  platform: ContentPlatform;
  content_type: ContentType;
  title: string | null;
  content: string;
  hashtags: string[] | null;
  mentions: string[] | null;
  image_prompt: string | null;
  image_path: string | null;
  video_prompt: string | null;
  video_path: string | null;
  media_urls: string[] | null;
  status: ContentStatus;
  scheduled_for: string | null;
  posted_at: string | null;
  analytics: Record<string, unknown>;
  campaign: string | null;
  created_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ============================================
// DATABASE SCHEMA TYPE
// ============================================
export interface Database {
  public: {
    Tables: {
      projects: {
        Row: Project;
        Insert: Omit<Project, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<Project, 'id' | 'created_at'>>;
      };
      roadmaps: {
        Row: Roadmap;
        Insert: Omit<Roadmap, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<Roadmap, 'id' | 'created_at'>>;
      };
      tasks: {
        Row: Task;
        Insert: Omit<Task, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<Task, 'id' | 'created_at'>>;
      };
      learnings: {
        Row: Learning;
        Insert: Omit<Learning, 'id' | 'created_at' | 'search_vector'> & { id?: string };
        Update: Partial<Omit<Learning, 'id' | 'created_at' | 'search_vector'>>;
      };
      learning_embeddings: {
        Row: LearningEmbedding;
        Insert: Omit<LearningEmbedding, 'id' | 'synced_at'> & { id?: string };
        Update: Partial<Omit<LearningEmbedding, 'id'>>;
      };
      meetings: {
        Row: Meeting;
        Insert: Omit<Meeting, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<Meeting, 'id' | 'created_at'>>;
      };
      activity_log: {
        Row: ActivityLog;
        Insert: Omit<ActivityLog, 'id' | 'created_at'> & { id?: string };
        Update: never;
      };
      content_calendar: {
        Row: ContentCalendar;
        Insert: Omit<ContentCalendar, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<ContentCalendar, 'id' | 'created_at'>>;
      };
    };
  };
}

// ============================================
// SUPABASE CLIENT SINGLETON
// ============================================
let supabaseClient: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (!supabaseClient) {
    const env = getEnv();
    supabaseClient = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabaseClient;
}

// ============================================
// HELPER FUNCTIONS
// ============================================
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export function handleError(error: unknown): never {
  if (error instanceof Error) {
    throw error;
  }
  throw new Error(String(error));
}

// ============================================
// TYPED QUERY HELPERS
// ============================================
export async function findProjectBySlug(slug: string): Promise<Project | null> {
  const db = getSupabase();
  const { data, error } = await db
    .from('projects')
    .select('*')
    .eq('slug', slug)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    handleError(error);
  }
  return data;
}

export async function findTasksByAgent(agentName: string): Promise<Task[]> {
  const db = getSupabase();
  const { data, error } = await db
    .from('tasks')
    .select('*')
    .eq('assigned_agent', agentName.toLowerCase())
    .in('status', ['todo', 'in_progress', 'review', 'blocked']);
  
  if (error) handleError(error);
  return data ?? [];
}

export async function findTasksByTeam(teamName: string): Promise<Task[]> {
  const db = getSupabase();
  const { data, error } = await db
    .from('tasks')
    .select('*')
    .eq('assigned_team', teamName.toLowerCase())
    .in('status', ['todo', 'in_progress', 'review', 'blocked']);
  
  if (error) handleError(error);
  return data ?? [];
}

export async function logActivity(
  agent: string,
  action: string,
  details: Record<string, unknown> = {},
  options: { projectId?: string; team?: string; relatedId?: string; relatedType?: string } = {}
): Promise<void> {
  const db = getSupabase();
  const { error } = await db.from('activity_log').insert({
    agent,
    action,
    details,
    project_id: options.projectId ?? null,
    team: options.team ?? null,
    related_id: options.relatedId ?? null,
    related_type: options.relatedType ?? null,
  });
  
  if (error) handleError(error);
}