// Hit-counter Lambda handler. Single-item DynamoDB increment, returns JSON.
//
// Endpoint contract:
//   GET /api/hits  -> { "count": <number>, "ts": <iso8601> }
//   any other method -> 405
//
// GET intentionally non-idempotent: every viewer fetch ticks the counter.
// This is the classic web-1.0 hit-counter semantic — not REST-pure but
// honest about what the page renders. No anti-bot filtering in v1; brief
// (#468) accepts crawler inflation as "the vibe is honest hit count, not
// unique humans".
//
// Atomic increment via DynamoDB UpdateItem with an `ADD` expression on
// the single sentinel key. Race-free under concurrent invocations because
// the DB does the read-modify-write; the Lambda just issues the call and
// reads the post-increment value back via ReturnValues=UPDATED_NEW.
//
// Bill cap: reserved_concurrent_executions in hitcounter.tf bounds runaway
// traffic. DynamoDB is on-demand (PAY_PER_REQUEST); a DoS at 1 req/min
// per concurrent invocation hits dollars in 5-figure territory only over
// months, which the Lambda throttle will cut off first.

import {
	DynamoDBClient,
	UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';

const ddb = new DynamoDBClient({});
const TABLE = process.env.HITS_TABLE;
const PK = 'hits'; // single-item counter; partition key value

function json(status, body) {
	return {
		statusCode: status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			// Defensive: tell every cache layer (CloudFront default behavior
			// is CachingDisabled on the /api/hits path, but a misconfigured
			// downstream proxy would otherwise serve stale counts).
			'Cache-Control': 'no-store, no-cache, must-revalidate',
		},
		body: JSON.stringify(body),
	};
}

export const handler = async (event) => {
	const method = event?.requestContext?.http?.method ?? 'GET';
	if (method !== 'GET') {
		return json(405, { error: 'method not allowed' });
	}
	try {
		const out = await ddb.send(
			new UpdateItemCommand({
				TableName: TABLE,
				Key: { pk: { S: PK } },
				UpdateExpression: 'ADD #c :one',
				ExpressionAttributeNames: { '#c': 'count' },
				ExpressionAttributeValues: { ':one': { N: '1' } },
				ReturnValues: 'UPDATED_NEW',
			}),
		);
		const count = Number(out.Attributes?.count?.N ?? '0');
		return json(200, { count, ts: new Date().toISOString() });
	} catch (err) {
		// Structured log line for the CloudWatch metric filter (see
		// hitcounter.tf:hits_put_failed). Match `msg` exactly.
		console.log(
			JSON.stringify({
				msg: 'hits ddb update failed',
				errName: err?.name ?? 'Error',
				errCode: err?.$metadata?.httpStatusCode ?? null,
			}),
		);
		return json(500, { error: 'counter unavailable' });
	}
};
