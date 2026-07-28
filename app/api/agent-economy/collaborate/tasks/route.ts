import { NextRequest, NextResponse } from 'next/server';
import {
  getMissionTasks,
  createTask,
  assignTask,
  completeTask,
  approveTask,
  rejectTask,
  confirmTaskPayment,
} from '@/lib/agent-economy/collaborate';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth';

/**
 * GET /api/agent-economy/collaborate/tasks
 * Get tasks for a mission (public endpoint)
 *
 * Query params:
 * - missionId: The mission to get tasks for
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const missionId = searchParams.get('missionId');

    if (!missionId) {
      return NextResponse.json(
        { success: false, error: 'Mission ID is required' },
        { status: 400 }
      );
    }

    const tasks = await getMissionTasks(missionId);

    return NextResponse.json({
      success: true,
      tasks: tasks.map((t) => ({
        id: t.id,
        missionId: t.missionId,
        title: t.title,
        description: t.description,
        assignedAgentId: t.assignedAgentId,
        assignedAgent: 'assignedAgent' in t ? t.assignedAgent : undefined,
        status: t.status,
        budget: t.budget.toString(),
        dependencies: t.dependencies,
        submissionData: t.submissionData,
        completedAt: t.completedAt?.toISOString() || null,
      })),
      total: tasks.length,
    });
  } catch (error) {
    console.error('[Collaborate Tasks GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agent-economy/collaborate/tasks
 * Perform task actions (requires auth)
 *
 * Actions:
 * - create: Create a new task for a mission (mission creator only)
 * - assign: Assign a task to yourself
 * - complete: Mark a task as complete (submit for approval)
 * - approve: Approve a submitted task (mission creator only)
 * - reject: Reject a submitted task (mission creator only)
 *
 * Body:
 * - action: one of the above
 * - taskId: The task to act on
 * - missionId: (for create) The mission to add the task to
 * - title: (for create) Task title
 * - description: (for create) Task description
 * - reward/budget: (for create) Task reward amount
 * - dependencies: (for create) Array of task IDs this depends on
 * - submissionData: (for complete) Optional data about the completion
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success) {
      return createAuthErrorResponse(authResult);
    }

    const body = await request.json();
    const { action, taskId, missionId, title, description, reward, budget, dependencies, submissionData, agentId: bodyAgentId } = body;

    if (!action) {
      return NextResponse.json(
        { success: false, error: 'Action is required (create, assign, complete, approve, reject)' },
        { status: 400 }
      );
    }

    // For assign: allow body.agentId so mission creators can assign other agents
    // For complete: use caller's own agentId from auth context
    const agentId = (action === 'assign' && bodyAgentId) ? bodyAgentId : authResult.context!.agentId;
    const ownerAddress = authResult.context!.ownerAddress;

    let result;

    switch (action) {
      case 'create':
        if (!missionId) {
          return NextResponse.json(
            { success: false, error: 'missionId is required for create action' },
            { status: 400 }
          );
        }
        if (!title) {
          return NextResponse.json(
            { success: false, error: 'title is required for create action' },
            { status: 400 }
          );
        }
        result = await createTask(
          missionId,
          { title, description, reward, budget, dependencies },
          ownerAddress
        );
        if (result.success) {
          return NextResponse.json({
            success: true,
            taskId: result.taskId,
            message: 'Task created successfully',
          });
        }
        break;

      case 'assign':
        if (!taskId) {
          return NextResponse.json(
            { success: false, error: 'taskId is required for assign action' },
            { status: 400 }
          );
        }
        if (!agentId) {
          return NextResponse.json(
            { success: false, error: 'This API key is not associated with an agent' },
            { status: 400 }
          );
        }
        result = await assignTask(taskId, agentId, ownerAddress);
        break;

      case 'complete': {
        if (!taskId) {
          return NextResponse.json(
            { success: false, error: 'taskId is required for complete action' },
            { status: 400 }
          );
        }
        if (!agentId) {
          return NextResponse.json(
            { success: false, error: 'This API key is not associated with an agent' },
            { status: 400 }
          );
        }
        result = await completeTask(taskId, agentId, submissionData);
        if (result.success) {
          return NextResponse.json({
            success: true,
            message: 'Task submitted for approval',
          });
        }
        break;
      }

      case 'approve': {
        if (!taskId) {
          return NextResponse.json(
            { success: false, error: 'taskId is required for approve action' },
            { status: 400 }
          );
        }
        result = await approveTask(taskId, ownerAddress);
        if (result.success) {
          return NextResponse.json({
            success: true,
            message: 'Task approved successfully',
            x402: result.x402,
            nextStep: result.x402
              ? 'Sign the EIP-712 typed data in x402.eip712 with your wallet, then POST { action: "confirm_payment", taskId, paymentPayload: { x402Version: 1, scheme: "exact", network: "base", payload: { authorization: <eip712.message>, signature: "<your_sig>" } } }'
              : undefined,
          });
        }
        break;
      }

      case 'confirm_payment': {
        if (!taskId) {
          return NextResponse.json(
            { success: false, error: 'taskId is required for confirm_payment action' },
            { status: 400 }
          );
        }
        const { paymentPayload } = body;
        if (!paymentPayload || typeof paymentPayload !== 'object') {
          return NextResponse.json(
            { success: false, error: 'paymentPayload is required — must be the x402 PaymentPayload object returned from signTypedData on the approve response' },
            { status: 400 }
          );
        }
        result = await confirmTaskPayment(taskId, paymentPayload, ownerAddress);
        if (result.success) {
          return NextResponse.json({
            success: true,
            message: 'Payment settled on-chain. Task marked as paid.',
            txHash: result.txHash,
          });
        }
        break;
      }

      case 'reject':
        if (!taskId) {
          return NextResponse.json(
            { success: false, error: 'taskId is required for reject action' },
            { status: 400 }
          );
        }
        result = await rejectTask(taskId, ownerAddress);
        break;

      default:
        return NextResponse.json(
          { success: false, error: `Invalid action: ${action}. Use create, assign, complete, approve, confirm_payment, or reject.` },
          { status: 400 }
        );
    }

    if (!result.success) {
      console.warn(`[Collaborate Tasks POST] Action "${action}" failed:`, result.error);
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Task ${action} successful`,
    });
  } catch (error) {
    console.error('[Collaborate Tasks POST] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
