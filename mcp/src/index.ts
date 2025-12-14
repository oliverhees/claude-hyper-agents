#!/usr/bin/env node
import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Database client
import { getSupabase, generateSlug, logActivity } from './db/supabase.js';
import type { ProjectStatus, TaskStatus, PriorityLevel } from './db/supabase.js';

// ============================================
// MCP SERVER SETUP
// ============================================
const server = new McpServer({
  name: 'claude-hyper-agents',
  version: '1.0.0',
});

// ============================================
// PROJECT TOOLS
// ============================================
server.tool(
  'ha_project_create',
  'Create a new project',
  {
    name: z.string().describe('Project name'),
    description: z.string().optional().describe('Project description'),
    template: z.string().optional().describe('Project template: saas, landing-page, etc.'),
    autonomous: z.boolean().optional().describe('Enable autonomous mode'),
  },
  async ({ name, description, template, autonomous }) => {
    const db = getSupabase();
    const slug = generateSlug(name);
    
    const { data, error } = await db
      .from('projects')
      .insert({
        name,
        slug,
        description: description ?? null,
        template: template ?? null,
        status: 'planning',
        settings: { autonomous: autonomous ?? false },
        tech_stack: {},
        metadata: {},
      })
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create project: ${error.message}`);
    
    await logActivity('system', 'project_created', { name, template }, { projectId: data.id });
    
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  'ha_project_get',
  'Get a project by ID or slug',
  {
    identifier: z.string().describe('Project ID (UUID) or slug'),
  },
  async ({ identifier }) => {
    const db = getSupabase();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
    
    const query = db.from('projects').select('*');
    const { data, error } = isUuid
      ? await query.eq('id', identifier).single()
      : await query.eq('slug', identifier).single();
    
    if (error) throw new Error(`Project not found: ${error.message}`);
    
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  'ha_project_list',
  'List all projects',
  {
    status: z.enum(['planning', 'active', 'paused', 'completed', 'archived']).optional(),
    limit: z.number().optional().describe('Max results (default 20)'),
  },
  async ({ status, limit }) => {
    const db = getSupabase();
    let query = db.from('projects').select('*').order('updated_at', { ascending: false });
    
    if (status) query = query.eq('status', status);
    query = query.limit(limit ?? 20);
    
    const { data, error } = await query;
    if (error) throw new Error(`Failed to list projects: ${error.message}`);
    
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  'ha_project_update',
  'Update a project',
  {
    project_id: z.string().describe('Project ID'),
    name: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(['planning', 'active', 'paused', 'completed', 'archived']).optional(),
    settings: z.record(z.unknown()).optional(),
  },
  async ({ project_id, ...updates }) => {
    const db = getSupabase();
    const updateData: Record<string, unknown> = {};
    
    if (updates.name) {
      updateData.name = updates.name;
      updateData.slug = generateSlug(updates.name);
    }
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.status) updateData.status = updates.status;
    if (updates.settings) updateData.settings = updates.settings;
    
    const { data, error } = await db
      .from('projects')
      .update(updateData)
      .eq('id', project_id)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to update project: ${error.message}`);
    
    await logActivity('system', 'project_updated', updates, { projectId: project_id });
    
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ============================================
// TASK TOOLS
// ============================================
server.tool(
  'ha_task_create',
  'Create a new task',
  {
    project_id: z.string().describe('Project ID'),
    title: z.string().describe('Task title'),
    description: z.string().optional(),
    team: z.string().optional().describe('Assigned team: devforge, pixelcraft, etc.'),
    agent: z.string().optional().describe('Assigned agent name'),
    priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
    parent_id: z.string().optional().describe('Parent task ID for subtasks'),
    estimated_hours: z.number().optional(),
    tags: z.array(z.string()).optional(),
  },
  async ({ project_id, title, description, team, agent, priority, parent_id, estimated_hours, tags }) => {
    const db = getSupabase();
    
    const { data, error } = await db
      .from('tasks')
      .insert({
        project_id,
        title,
        description: description ?? null,
        assigned_team: team?.toLowerCase() ?? null,
        assigned_agent: agent?.toLowerCase() ?? null,
        priority: priority ?? 'medium',
        parent_id: parent_id ?? null,
        estimated_hours: estimated_hours ?? null,
        tags: tags ?? [],
        status: 'backlog',
        roadmap_id: null,
        blocked_by: null,
        blocker_reason: null,
        deliverable_path: null,
        deliverables: [],
        metadata: {},
        created_by: agent ?? 'system',
        updated_by: null,
        actual_hours: null,
        due_date: null,
        started_at: null,
        completed_at: null,
      })
      .select()
      .single();
    
    if (error) throw new Error(`Failed to create task: ${error.message}`);
    
    await logActivity(agent ?? 'system', 'task_created', { title, team }, {
      projectId: project_id,
      team,
      relatedId: data.id,
      relatedType: 'task',
    });
    
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  'ha_task_list',
  'List tasks with filters',
  {
    project_id: z.string().optional(),
    status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'blocked', 'done']).optional(),
    team: z.string().optional(),
    agent: z.string().optional(),
    priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
    limit: z.number().optional(),
  },
  async ({ project_id, status, team, agent, priority, limit }) => {
    const db = getSupabase();
    let query = db.from('tasks').select('*').order('created_at', { ascending: false });
    
    if (project_id) query = query.eq('project_id', project_id);
    if (status) query = query.eq('status', status);
    if (team) query = query.eq('assigned_team', team.toLowerCase());
    if (agent) query = query.eq('assigned_agent', agent.toLowerCase());
    if (priority) query = query.eq('priority', priority);
    query = query.limit(limit ?? 50);
    
    const { data, error } = await query;
    if (error) throw new Error(`Failed to list tasks: ${error.message}`);
    
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  'ha_task_update',
  'Update a task',
  {
    task_id: z.string().describe('Task ID'),
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'blocked', 'done']).optional(),
    priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
    team: z.string().optional(),
    agent: z.string().optional(),
    estimated_hours: z.number().optional(),
    actual_hours: z.number().optional(),
    updated_by: z.string().optional(),
  },
  async ({ task_id, updated_by, ...updates }) => {
    const db = getSupabase();
    const updateData: Record<string, unknown> = { updated_by: updated_by ?? 'system' };
    
    if (updates.title) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.status) {
      updateData.status = updates.status;
      if (updates.status === 'in_progress') updateData.started_at = new Date().toISOString();
      if (updates.status === 'done') updateData.completed_at = new Date().toISOString();
    }
    if (updates.priority) updateData.priority = updates.priority;
    if (updates.team) updateData.assigned_team = updates.team.toLowerCase();
    if (updates.agent) updateData.assigned_agent = updates.agent.toLowerCase();
    if (updates.estimated_hours !== undefined) updateData.estimated_hours = updates.estimated_hours;
    if (updates.actual_hours !== undefined) updateData.actual_hours = updates.actual_hours;
    
    const { data, error } = await db
      .from('tasks')
      .update(updateData)
      .eq('id', task_id)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to update task: ${error.message}`);
    
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  'ha_task_assign',
  'Assign a task to a team/agent',
  {
    task_id: z.string(),
    team: z.string().describe('Team name: devforge, pixelcraft, etc.'),
    agent: z.string().optional().describe('Agent name'),
  },
  async ({ task_id, team, agent }) => {
    const db = getSupabase();
    
    const { data, error } = await db
      .from('tasks')
      .update({
        assigned_team: team.toLowerCase(),
        assigned_agent: agent?.toLowerCase() ?? null,
        status: 'todo',
        updated_by: agent ?? 'system',
      })
      .eq('id', task_id)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to assign task: ${error.message}`);
    
    await logActivity(agent ?? 'system', 'task_assigned', { team, agent }, {
      projectId: data.project_id,
      team,
      relatedId: task_id,
      relatedType: 'task',
    });
    
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  'ha_task_status',
  'Update task status',
  {
    task_id: z.string(),
    status: z.enum(['backlog', 'todo', 'in_progress', 'review', 'blocked', 'done']),
    agent: z.string().optional().describe('Agent making the change'),
    notes: z.string().optional(),
  },
  async ({ task_id, status, agent, notes }) => {
    const db = getSupabase();
    const updateData: Record<string, unknown> = {
      status,
      updated_by: agent ?? 'system',
    };
    
    if (status === 'in_progress') updateData.started_at = new Date().toISOString();
    if (status === 'done') updateData.completed_at = new Date().toISOString();
    if (status === 'blocked' && notes) updateData.blocker_reason = notes;
    if (status !== 'blocked') updateData.blocker_reason = null;
    
    const { data, error } = await db
      .from('tasks')
      .update(updateData)
      .eq('id', task_id)
      .select()
      .single();
    
    if (error) throw new Error(`Failed to update status: ${error.message}`);
    
    await logActivity(agent ?? 'system', `task_${status}`, { notes }, {
      projectId: data.project_id,
      team: data.assigned_team ?? undefined,
      relatedId: task_id,
      relatedType: 'task',
    });
    
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  'ha_task_my_tasks',
  'Get tasks assigned to a specific agent',
  {
    agent: z.string().describe('Agent name'),
    include_done: z.boolean().optional().describe('Include completed tasks'),
  },
  async ({ agent, include_done }) => {
    const db = getSupabase();
    let query = db
      .from('tasks')
      .select('*')
      .eq('assigned_agent', agent.toLowerCase())
      .order('priority')
      .order('created_at', { ascending: false });
    
    if (!include_done) {
      query = query.in('status', ['backlog', 'todo', 'in_progress', 'review', 'blocked']);
    }
    
    const { data, error } = await query;
    if (error) throw new Error(`Failed to get tasks: ${error.message}`);
    
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  'ha_task_team_tasks',
  'Get tasks for a team',
  {
    team: z.string().describe('Team name: devforge, pixelcraft, etc.'),
    include_done: z.boolean().optional(),
  },
  async ({ team, include_done }) => {
    const db = getSupabase();
    let query = db
      .from('tasks')
      .select('*')
      .eq('assigned_team', team.toLowerCase())
      .order('priority')
      .order('created_at', { ascending: false });
    
    if (!include_done) {
      query = query.in('status', ['backlog', 'todo', 'in_progress', 'review', 'blocked']);
    }
    
    const { data, error } = await query;
    if (error) throw new Error(`Failed to get team tasks: ${error.message}`);
    
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ============================================
// ACTIVITY TOOLS
// ============================================
server.tool(
  'ha_activity_log',
  'Log an activity',
  {
    agent: z.string().describe('Agent name'),
    action: z.string().describe('Action type'),
    details: z.record(z.unknown()).optional(),
    project_id: z.string().optional(),
    team: z.string().optional(),
  },
  async ({ agent, action, details, project_id, team }) => {
    await logActivity(agent, action, details ?? {}, { projectId: project_id, team });
    return {
      content: [{ type: 'text', text: 'Activity logged successfully' }],
    };
  }
);

server.tool(
  'ha_activity_get',
  'Get activity log',
  {
    project_id: z.string().optional(),
    agent: z.string().optional(),
    team: z.string().optional(),
    action: z.string().optional(),
    limit: z.number().optional(),
  },
  async ({ project_id, agent, team, action, limit }) => {
    const db = getSupabase();
    let query = db.from('activity_log').select('*').order('created_at', { ascending: false });
    
    if (project_id) query = query.eq('project_id', project_id);
    if (agent) query = query.eq('agent', agent);
    if (team) query = query.eq('team', team);
    if (action) query = query.eq('action', action);
    query = query.limit(limit ?? 50);
    
    const { data, error } = await query;
    if (error) throw new Error(`Failed to get activity: ${error.message}`);
    
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ============================================
// STATUS TOOLS
// ============================================
server.tool(
  'ha_status_project',
  'Get project dashboard status',
  {
    project_id: z.string(),
  },
  async ({ project_id }) => {
    const db = getSupabase();
    
    const [projectRes, tasksRes, activityRes] = await Promise.all([
      db.from('projects').select('*').eq('id', project_id).single(),
      db.from('tasks').select('status, priority, assigned_team').eq('project_id', project_id),
      db.from('activity_log').select('*').eq('project_id', project_id).order('created_at', { ascending: false }).limit(10),
    ]);
    
    if (projectRes.error) throw new Error(`Project not found: ${projectRes.error.message}`);
    
    const tasks = tasksRes.data ?? [];
    const statusCounts = tasks.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const teamCounts = tasks.reduce((acc, t) => {
      if (t.assigned_team) {
        acc[t.assigned_team] = (acc[t.assigned_team] ?? 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          project: projectRes.data,
          tasks: { total: tasks.length, by_status: statusCounts, by_team: teamCounts },
          recent_activity: activityRes.data ?? [],
        }, null, 2),
      }],
    };
  }
);

// ============================================
// START SERVER
// ============================================
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Claude Hyper Agents MCP Server running');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});