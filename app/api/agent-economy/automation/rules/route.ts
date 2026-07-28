/**
 * Automation Rules API
 * CRUD for agent automation rules (auto-apply, auto-bid, notifications)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import {
  authenticateRequest,
  createAuthErrorResponse,
  addAgenticHeaders,
  safeParseJson,
} from '@/lib/agent-economy/auth';


// ==========================================
// Types
// ==========================================

type RuleType = 'auto_apply' | 'auto_bid' | 'notification' | 'availability';

interface AutomationRule {
  id: string;
  agentId: string;
  ruleName: string;
  ruleType: RuleType;
  conditions: RuleConditions;
  action: RuleAction;
  isActive: boolean;
  priority: number;
  triggersCount: number;
  lastTriggeredAt: string | null;
  createdAt: string;
}

interface RuleConditions {
  // Mission/task matching conditions
  capabilities?: string[];           // Match if mission requires these
  minBudget?: number;               // Minimum budget to trigger
  maxBudget?: number;               // Maximum budget
  categories?: string[];            // Match specific categories
  excludeCategories?: string[];     // Exclude these categories
  minReputation?: number;           // Minimum creator reputation
  maxActiveTasks?: number;          // Don't trigger if agent has this many active tasks
  keywords?: string[];              // Match title/description keywords
  excludeKeywords?: string[];       // Exclude if contains keywords
}

interface RuleAction {
  // For auto_apply
  applicationText?: string;         // Text to use for application

  // For auto_bid
  bidMultiplier?: number;           // Multiply mission budget by this (e.g., 0.9 = 10% below)
  fixedBid?: number;                // Or use a fixed bid amount

  // For notification
  webhookUrl?: string;              // Custom webhook to notify
  notifyEvents?: string[];          // Which events to notify for

  // For availability
  setAvailable?: boolean;           // Set agent availability
  scheduleStart?: string;           // Time to set available
  scheduleEnd?: string;             // Time to set unavailable
}

// ==========================================
// Validation
// ==========================================

const VALID_RULE_TYPES: RuleType[] = ['auto_apply', 'auto_bid', 'notification', 'availability'];

function validateRule(
  ruleType: RuleType,
  conditions: RuleConditions,
  action: RuleAction
): { valid: boolean; error?: string } {
  // Validate conditions
  if (!conditions || typeof conditions !== 'object') {
    return { valid: false, error: 'conditions must be an object' };
  }

  // Validate action based on rule type
  if (!action || typeof action !== 'object') {
    return { valid: false, error: 'action must be an object' };
  }

  switch (ruleType) {
    case 'auto_apply':
      if (!action.applicationText || action.applicationText.length < 10) {
        return { valid: false, error: 'auto_apply rules require applicationText (min 10 chars)' };
      }
      break;

    case 'auto_bid':
      if (!action.bidMultiplier && !action.fixedBid) {
        return { valid: false, error: 'auto_bid rules require bidMultiplier or fixedBid' };
      }
      if (action.bidMultiplier && (action.bidMultiplier <= 0 || action.bidMultiplier > 2)) {
        return { valid: false, error: 'bidMultiplier must be between 0 and 2' };
      }
      break;

    case 'notification':
      // Notifications are optional, no strict requirements
      break;

    case 'availability':
      if (action.setAvailable === undefined && !action.scheduleStart && !action.scheduleEnd) {
        return { valid: false, error: 'availability rules require setAvailable or schedule times' };
      }
      break;
  }

  return { valid: true };
}

// ==========================================
// Helpers
// ==========================================

function mapRule(data: Record<string, unknown>): AutomationRule {
  return {
    id: data.id as string,
    agentId: data.agent_id as string,
    ruleName: data.rule_name as string,
    ruleType: data.rule_type as RuleType,
    conditions: data.conditions as RuleConditions,
    action: data.action as RuleAction,
    isActive: data.is_active as boolean,
    priority: data.priority as number,
    triggersCount: data.triggers_count as number,
    lastTriggeredAt: data.last_triggered_at as string | null,
    createdAt: data.created_at as string,
  };
}

// ==========================================
// API Handlers
// ==========================================

/**
 * GET /api/agent-economy/automation/rules
 * List automation rules for an agent
 *
 * Query params:
 * - agentId: Agent to list rules for (default: authenticated agent)
 * - ruleType: Filter by type
 * - isActive: Filter by active status
 */
export async function GET(request: NextRequest) {
  const authResult = await authenticateRequest(request, 'read');
  if (!authResult.success) {
    return createAuthErrorResponse(authResult);
  }

  const context = authResult.context!;
  const rateLimit = authResult.rateLimit;
  const searchParams = request.nextUrl.searchParams;

  const agentId = searchParams.get('agentId') || context.agentId;
  const ruleType = searchParams.get('ruleType') as RuleType | null;
  const isActive = searchParams.get('isActive');

  if (!agentId) {
    const response = NextResponse.json(
      { success: false, error: 'agentId is required', requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  try {
    let query = supabaseAdmin
      .from('agent_automation_rules')
      .select('*')
      .eq('agent_id', agentId)
      .order('priority', { ascending: false });

    if (ruleType && VALID_RULE_TYPES.includes(ruleType)) {
      query = query.eq('rule_type', ruleType);
    }
    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true');
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Automation Rules API] Query error:', error);
      const response = NextResponse.json(
        { success: false, error: 'Failed to fetch rules', requestId: context.requestId },
        { status: 500 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const rules = (data || []).map(mapRule);

    const response = NextResponse.json({
      success: true,
      rules,
      count: rules.length,
      requestId: context.requestId,
    });
    return addAgenticHeaders(response, context, rateLimit);
  } catch (error) {
    console.error('[Automation Rules API] GET error:', error);
    const response = NextResponse.json(
      { success: false, error: 'Internal server error', requestId: context.requestId },
      { status: 500 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }
}

/**
 * POST /api/agent-economy/automation/rules
 * Create a new automation rule
 *
 * Body:
 * - agentId: Agent to create rule for (default: authenticated agent)
 * - ruleName: Unique name for the rule
 * - ruleType: auto_apply, auto_bid, notification, availability
 * - conditions: Conditions that trigger the rule
 * - action: Action to take when triggered
 * - priority: (optional) Higher priority rules evaluated first
 */
export async function POST(request: NextRequest) {
  const authResult = await authenticateRequest(request, 'write');
  if (!authResult.success) {
    return createAuthErrorResponse(authResult);
  }

  const context = authResult.context!;
  const rateLimit = authResult.rateLimit;

  const { data: body, error: parseError } = await safeParseJson<{
    agentId?: string;
    ruleName: string;
    ruleType: RuleType;
    conditions: RuleConditions;
    action: RuleAction;
    priority?: number;
  }>(request);

  if (parseError) {
    return parseError;
  }

  if (!body) {
    const response = NextResponse.json(
      { success: false, error: 'Request body is required', requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  const agentId = body.agentId || context.agentId;

  if (!agentId) {
    const response = NextResponse.json(
      { success: false, error: 'agentId is required', requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  if (!body.ruleName || body.ruleName.length < 3) {
    const response = NextResponse.json(
      { success: false, error: 'ruleName is required (min 3 chars)', requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  if (!body.ruleType || !VALID_RULE_TYPES.includes(body.ruleType)) {
    const response = NextResponse.json(
      { success: false, error: `ruleType must be one of: ${VALID_RULE_TYPES.join(', ')}`, requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  // Validate rule
  const validation = validateRule(body.ruleType, body.conditions, body.action);
  if (!validation.valid) {
    const response = NextResponse.json(
      { success: false, error: validation.error, requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  try {
    // Check for duplicate rule name
    const { data: existing } = await supabaseAdmin
      .from('agent_automation_rules')
      .select('id')
      .eq('agent_id', agentId)
      .eq('rule_name', body.ruleName)
      .single();

    if (existing) {
      const response = NextResponse.json(
        { success: false, error: 'A rule with this name already exists', requestId: context.requestId },
        { status: 400 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    // Limit rules per agent
    const { count } = await supabaseAdmin
      .from('agent_automation_rules')
      .select('id', { count: 'exact' })
      .eq('agent_id', agentId);

    if ((count || 0) >= 20) {
      const response = NextResponse.json(
        { success: false, error: 'Maximum 20 rules per agent', requestId: context.requestId },
        { status: 400 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const { data, error } = await supabaseAdmin
      .from('agent_automation_rules')
      .insert({
        agent_id: agentId,
        rule_name: body.ruleName.trim(),
        rule_type: body.ruleType,
        conditions: body.conditions,
        action: body.action,
        priority: body.priority || 0,
        is_active: true,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error('[Automation Rules API] Insert error:', error);
      const response = NextResponse.json(
        { success: false, error: 'Failed to create rule', requestId: context.requestId },
        { status: 500 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const response = NextResponse.json({
      success: true,
      rule: mapRule(data),
      requestId: context.requestId,
    });
    return addAgenticHeaders(response, context, rateLimit);
  } catch (error) {
    console.error('[Automation Rules API] POST error:', error);
    const response = NextResponse.json(
      { success: false, error: 'Internal server error', requestId: context.requestId },
      { status: 500 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }
}

/**
 * PUT /api/agent-economy/automation/rules
 * Update an automation rule
 *
 * Body:
 * - ruleId: Rule to update
 * - ruleName: (optional) New name
 * - conditions: (optional) New conditions
 * - action: (optional) New action
 * - priority: (optional) New priority
 * - isActive: (optional) Enable/disable
 */
export async function PUT(request: NextRequest) {
  const authResult = await authenticateRequest(request, 'write');
  if (!authResult.success) {
    return createAuthErrorResponse(authResult);
  }

  const context = authResult.context!;
  const rateLimit = authResult.rateLimit;

  const { data: body, error: parseError } = await safeParseJson<{
    ruleId: string;
    ruleName?: string;
    conditions?: RuleConditions;
    action?: RuleAction;
    priority?: number;
    isActive?: boolean;
  }>(request);

  if (parseError) {
    return parseError;
  }

  if (!body?.ruleId) {
    const response = NextResponse.json(
      { success: false, error: 'ruleId is required', requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  try {
    // Get existing rule
    const { data: existing } = await supabaseAdmin
      .from('agent_automation_rules')
      .select('*')
      .eq('id', body.ruleId)
      .single();

    if (!existing) {
      const response = NextResponse.json(
        { success: false, error: 'Rule not found', requestId: context.requestId },
        { status: 404 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    // Verify ownership
    if (existing.agent_id !== context.agentId) {
      const response = NextResponse.json(
        { success: false, error: 'Not authorized to update this rule', requestId: context.requestId },
        { status: 403 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    // Build update object
    const updates: Record<string, unknown> = {};

    if (body.ruleName !== undefined) {
      updates.rule_name = body.ruleName.trim();
    }
    if (body.conditions !== undefined) {
      updates.conditions = body.conditions;
    }
    if (body.action !== undefined) {
      updates.action = body.action;
    }
    if (body.priority !== undefined) {
      updates.priority = body.priority;
    }
    if (body.isActive !== undefined) {
      updates.is_active = body.isActive;
    }

    // Validate if conditions/action changed
    const newConditions = body.conditions || existing.conditions;
    const newAction = body.action || existing.action;
    const validation = validateRule(existing.rule_type as RuleType, newConditions, newAction);
    if (!validation.valid) {
      const response = NextResponse.json(
        { success: false, error: validation.error, requestId: context.requestId },
        { status: 400 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const { data, error } = await supabaseAdmin
      .from('agent_automation_rules')
      .update(updates)
      .eq('id', body.ruleId)
      .select('*')
      .single();

    if (error || !data) {
      console.error('[Automation Rules API] Update error:', error);
      const response = NextResponse.json(
        { success: false, error: 'Failed to update rule', requestId: context.requestId },
        { status: 500 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const response = NextResponse.json({
      success: true,
      rule: mapRule(data),
      requestId: context.requestId,
    });
    return addAgenticHeaders(response, context, rateLimit);
  } catch (error) {
    console.error('[Automation Rules API] PUT error:', error);
    const response = NextResponse.json(
      { success: false, error: 'Internal server error', requestId: context.requestId },
      { status: 500 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }
}

/**
 * DELETE /api/agent-economy/automation/rules
 * Delete an automation rule
 *
 * Query params:
 * - ruleId: Rule to delete
 */
export async function DELETE(request: NextRequest) {
  const authResult = await authenticateRequest(request, 'write');
  if (!authResult.success) {
    return createAuthErrorResponse(authResult);
  }

  const context = authResult.context!;
  const rateLimit = authResult.rateLimit;
  const ruleId = request.nextUrl.searchParams.get('ruleId');

  if (!ruleId) {
    const response = NextResponse.json(
      { success: false, error: 'ruleId query param is required', requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  try {
    // Verify ownership
    const { data: existing } = await supabaseAdmin
      .from('agent_automation_rules')
      .select('agent_id')
      .eq('id', ruleId)
      .single();

    if (!existing) {
      const response = NextResponse.json(
        { success: false, error: 'Rule not found', requestId: context.requestId },
        { status: 404 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    if (existing.agent_id !== context.agentId) {
      const response = NextResponse.json(
        { success: false, error: 'Not authorized to delete this rule', requestId: context.requestId },
        { status: 403 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const { error } = await supabaseAdmin
      .from('agent_automation_rules')
      .delete()
      .eq('id', ruleId);

    if (error) {
      console.error('[Automation Rules API] Delete error:', error);
      const response = NextResponse.json(
        { success: false, error: 'Failed to delete rule', requestId: context.requestId },
        { status: 500 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const response = NextResponse.json({
      success: true,
      message: 'Rule deleted',
      requestId: context.requestId,
    });
    return addAgenticHeaders(response, context, rateLimit);
  } catch (error) {
    console.error('[Automation Rules API] DELETE error:', error);
    const response = NextResponse.json(
      { success: false, error: 'Internal server error', requestId: context.requestId },
      { status: 500 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }
}
