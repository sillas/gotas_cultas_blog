import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  SchedulerClient,
  ConflictException,
} from "@aws-sdk/client-scheduler";
import { UpdateScheduleCommand } from "@aws-sdk/client-scheduler";

const client = new SchedulerClient({});

function scheduleName(slug: string): string {
  return `publish-${slug}`;
}

/** at() expressions run in UTC because ScheduleExpressionTimezone is fixed below (PROJECT_SPEC.md section 13.5). */
function toAtExpression(isoUtc: string): string {
  return `at(${isoUtc.replace(/\.\d+Z$/, "").replace(/Z$/, "")})`;
}

export async function upsertPublishSchedule(slug: string, publishAtUtcIso: string): Promise<void> {
  const input = {
    Name: scheduleName(slug),
    GroupName: process.env.SCHEDULER_GROUP_NAME!,
    ScheduleExpression: toAtExpression(publishAtUtcIso),
    ScheduleExpressionTimezone: "UTC",
    FlexibleTimeWindow: { Mode: "OFF" as const },
    Target: {
      Arn: process.env.PUBLISH_SCHEDULER_FUNCTION_ARN!,
      RoleArn: process.env.SCHEDULER_ROLE_ARN!,
      Input: JSON.stringify({ slug }),
      DeadLetterConfig: { Arn: process.env.SCHEDULER_DLQ_ARN! },
    },
    ActionAfterCompletion: "DELETE" as const,
  };

  try {
    await client.send(new CreateScheduleCommand(input));
  } catch (err) {
    if (err instanceof ConflictException) {
      await client.send(new UpdateScheduleCommand(input));
      return;
    }
    throw err;
  }
}

export async function deletePublishSchedule(slug: string): Promise<void> {
  try {
    await client.send(
      new DeleteScheduleCommand({ Name: scheduleName(slug), GroupName: process.env.SCHEDULER_GROUP_NAME! })
    );
  } catch {
    // Nothing to delete (post was never scheduled, or the schedule already fired
    // and self-deleted via ActionAfterCompletion) — not an error condition.
  }
}
