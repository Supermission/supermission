import { NextRequest, NextResponse } from 'next/server';
import {
  createMission,
  listMissions,
  getMission,
  getMissionTasks,
  getMissionTeam,
  cancelMission,
  updateMission,
  deleteMission,
} from '@/lib/agent-economy/collaborate';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth';
import { Address } from 'viem';
import { validateAtomicAmount } from '@/lib/agent-economy/utils/validate-amount';
import { parsePagination } from '@/lib/agent-economy/utils/validation';
import { supabaseAdmin } from '@/lib/supabase/client';

/**
 * Look up an agent's reputation by wallet address.
 */
async function getAgentReputation(walletAddress: string): Promise<{
  id: string;
  name: string;
  rating: number | null;
  jobsCompleted: number;
  totalReviews: number;
  totalEarnings: string;
} | null> {
  const { data } = await supabaseAdmin
    .from('marketplace_agents')
    .select('id, agent_name, rating, jobs_completed, total_reviews, total_earnings')
    .ilike('wallet_address', walletAddress)
    .single();

  if (!data) return null;
  return {
    id: data.id,
    name: data.agent_name,
    rating: data.rating,
    jobsCompleted: data.jobs_completed || 0,
    totalReviews: data.total_reviews || 0,
    totalEarnings: data.total_earnings || '0',
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const missionId = searchParams.get('id');
    const clientAddress = searchParams.get('clientAddress');
    const status = searchParams.get('status') as any;
    const { limit, offset } = parsePagination(searchParams);

    // Get single mission with details
    if (missionId) {
      const mission = await getMission(missionId);
      if (!mission) {
        return NextResponse.json(
          { success: false, error: 'Mission not found' },
          { status: 404 }
        );
      }

      const [tasks, team, creatorReputation] = await Promise.all([
        getMissionTasks(missionId),
        getMissionTeam(missionId),
        getAgentReputation(mission.clientAddress),
      ]);

      return NextResponse.json({
        success: true,
        mission: {
          ...mission,
          budget: mission.budget.toString(),
          creatorAddress: mission.clientAddress,
          creatorAgentId: creatorReputation?.id || null,
          creator: creatorReputation ? {
            id: creatorReputation.id,
            name: creatorReputation.name,
            reputation: {
              rating: creatorReputation.rating,
              jobsCompleted: creatorReputation.jobsCompleted,
              totalReviews: creatorReputation.totalReviews,
              totalEarnings: creatorReputation.totalEarnings,
            },
          } : undefined,
        },
        tasks: tasks.map((t) => ({
          ...t,
          budget: t.budget.toString(),
          reward: t.budget.toString(), // Alias for frontend
        })),
        team,
      });
    }

    // List missions
    const result = await listMissions({
      clientAddress: clientAddress as Address | undefined,
      status,
      limit,
      offset,
    });

    // Batch-fetch creator reputations for all missions
    const creatorAddresses = [...new Set(result.missions.map((m) => m.clientAddress))];
    const creatorMap = new Map<string, Awaited<ReturnType<typeof getAgentReputation>>>();
    await Promise.all(
      creatorAddresses.map(async (addr) => {
        const rep = await getAgentReputation(addr);
        if (rep) creatorMap.set(addr.toLowerCase(), rep);
      })
    );

    return NextResponse.json({
      success: true,
      missions: result.missions.map((m) => {
        const creatorRep = creatorMap.get(m.clientAddress.toLowerCase());
        return {
          ...m,
          budget: m.budget.toString(),
          creatorAddress: m.clientAddress,
          creatorAgentId: creatorRep?.id || null,
          creator: creatorRep ? {
            id: creatorRep.id,
            name: creatorRep.name,
            reputation: {
              rating: creatorRep.rating,
              jobsCompleted: creatorRep.jobsCompleted,
              totalReviews: creatorRep.totalReviews,
              totalEarnings: creatorRep.totalEarnings,
            },
          } : undefined,
          taskCount: m.taskCount,
          teamSize: m.teamSize,
        };
      }),
      total: result.total,
    });
  } catch (error) {
    console.error('[Collaborate Missions GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate request
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success) {
      return createAuthErrorResponse(authResult);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing JSON body' },
        { status: 400 }
      );
    }
    const { title, description, clientAddress, budget, deadline, tasks, category, action, missionId } = body;

    // Handle cancel action
    if (action === 'cancel') {
      if (!missionId) {
        return NextResponse.json(
          { success: false, error: 'missionId is required for cancel action' },
          { status: 400 }
        );
      }
      const cancelResult = await cancelMission(missionId, authResult.context!.ownerAddress);
      if (!cancelResult.success) {
        return NextResponse.json(
          { success: false, error: cancelResult.error },
          { status: 400 }
        );
      }
      return NextResponse.json({
        success: true,
        message: 'Mission cancelled successfully.',
      });
    }

    // Default: create mission flow
    const missingFields = [];
    if (!title) missingFields.push('title');
    if (!description) missingFields.push('description');
    if (!budget) missingFields.push('budget');
    if (missingFields.length > 0) {
      return NextResponse.json(
        { success: false, error: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate budget — reject scientific notation, enforce bounds
    const budgetValidation = validateAtomicAmount(budget, 'Budget', 1_000_000_000);
    if (!budgetValidation.valid) {
      return NextResponse.json(
        { success: false, error: budgetValidation.error },
        { status: 400 }
      );
    }

    // Warn about decimal values — amounts should be in USDC atomic units (6 decimals)
    const budgetStr = String(budget);
    if (budgetStr.includes('.') && budgetValidation.amount < 1000) {
      return NextResponse.json(
        { success: false, error: `Budget "${budgetStr}" looks like a decimal USDC amount. Use atomic units instead (6 decimals). Examples: 0.05 USDC = "50000", 1 USDC = "1000000", 500 USDC = "500000000".` },
        { status: 400 }
      );
    }

    // Validate category
    const VALID_CATEGORIES = ['development', 'research', 'trading', 'content', 'data', 'other'];
    if (category && !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { success: false, error: `Invalid category "${category}". Valid categories: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 }
      );
    }

    // Reject explicitly empty tasks array
    if (tasks !== undefined && (!Array.isArray(tasks) || tasks.length === 0)) {
      return NextResponse.json(
        { success: false, error: 'Tasks must be a non-empty array. Omit the field to create a mission without initial tasks.' },
        { status: 400 }
      );
    }

    // Use authenticated ownerAddress as creator when clientAddress is not provided
    // This ensures the mission creator matches the API key owner for subsequent auth checks
    const effectiveClientAddress = (clientAddress || authResult.context!.ownerAddress) as Address;

    const result = await createMission({
      title,
      description,
      clientAddress: effectiveClientAddress,
      budget,
      category,
      deadline: deadline ? new Date(deadline) : undefined,
      tasks,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      missionId: result.missionId,
      status: result.status,
      nextStep: result.nextStep,
    });
  } catch (error) {
    console.error('[Collaborate Missions POST] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success) {
      return createAuthErrorResponse(authResult);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing JSON body' },
        { status: 400 }
      );
    }

    const { missionId, title, description, budget, deadline, category } = body;

    if (!missionId) {
      return NextResponse.json(
        { success: false, error: 'missionId is required' },
        { status: 400 }
      );
    }

    // Validate budget if provided
    if (budget !== undefined) {
      const { validateAtomicAmount } = await import('@/lib/agent-economy/utils/validate-amount');
      const budgetValidation = validateAtomicAmount(budget, 'Budget', 1_000_000_000);
      if (!budgetValidation.valid) {
        return NextResponse.json(
          { success: false, error: budgetValidation.error },
          { status: 400 }
        );
      }
    }

    // Validate category if provided
    const VALID_CATEGORIES = ['development', 'research', 'trading', 'content', 'data', 'other'];
    if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { success: false, error: `Invalid category "${category}". Valid: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 }
      );
    }

    const result = await updateMission(missionId, authResult.context!.ownerAddress, {
      title,
      description,
      budget,
      deadline,
      category,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: 'Mission updated successfully.' });
  } catch (error) {
    console.error('[Collaborate Missions PUT] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success) {
      return createAuthErrorResponse(authResult);
    }

    const missionId =
      request.nextUrl.searchParams.get('missionId') ||
      (await request.json().catch(() => ({}))).missionId;

    if (!missionId) {
      return NextResponse.json(
        { success: false, error: 'missionId is required' },
        { status: 400 }
      );
    }

    const result = await deleteMission(missionId, authResult.context!.ownerAddress);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: 'Mission permanently deleted.' });
  } catch (error) {
    console.error('[Collaborate Missions DELETE] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
