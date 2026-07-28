import { NextRequest, NextResponse } from 'next/server';
import {
  getMission,
  getMissionTasks,
  getMissionTeam,
  getMissionApplications,
} from '@/lib/agent-economy/collaborate';

/**
 * GET /api/agent-economy/collaborate/missions/:missionId
 * Get a single mission by ID with tasks and team
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ missionId: string }> }
) {
  try {
    const { missionId } = await params;

    if (!missionId) {
      return NextResponse.json(
        { success: false, error: 'Mission ID is required' },
        { status: 400 }
      );
    }

    const mission = await getMission(missionId);
    if (!mission) {
      return NextResponse.json(
        { success: false, error: 'Mission not found' },
        { status: 404 }
      );
    }

    const [tasks, team, applications] = await Promise.all([
      getMissionTasks(missionId),
      getMissionTeam(missionId),
      getMissionApplications(missionId),
    ]);

    return NextResponse.json({
      success: true,
      mission: {
        ...mission,
        budget: mission.budget.toString(),
        creatorAddress: mission.clientAddress,
      },
      tasks: tasks.map((t) => ({
        ...t,
        budget: t.budget.toString(),
        reward: t.budget.toString(),
      })),
      team,
      applications: applications.map((a) => ({
        ...a,
        appliedAt: a.appliedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[Mission GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
