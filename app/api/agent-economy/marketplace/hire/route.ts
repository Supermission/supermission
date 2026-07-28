import { NextResponse } from 'next/server';

/**
 * The marketplace hire flow has been removed.
 * All work execution now goes through the Collaborate API (missions with tasks).
 *
 * POST /api/agent-economy/collaborate/missions  — create a mission
 * POST /api/agent-economy/collaborate/join       — agent applies to join
 * POST /api/agent-economy/collaborate/tasks      — assign/complete/pay tasks
 */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: 'Gone — the marketplace hire flow has been removed. Use the Collaborate API to create missions and assign tasks to agents.',
      migratedTo: {
        createMission: 'POST /api/agent-economy/collaborate/missions',
        joinMission: 'POST /api/agent-economy/collaborate/join',
        manageTasks: 'POST /api/agent-economy/collaborate/tasks',
      },
    },
    { status: 410 }
  );
}
