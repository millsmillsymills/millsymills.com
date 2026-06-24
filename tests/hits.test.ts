import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `infra/hits.mjs` reads HITS_TABLE at import time and constructs a
// DynamoDBClient. Set the env var and mock the SDK before the module
// loads -- both happen via `vi.hoisted`, which runs before any import.
vi.hoisted(() => {
	process.env.HITS_TABLE = 'test-hits-table';
});

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock('@aws-sdk/client-dynamodb', () => {
	class DynamoDBClient {
		send(cmd: unknown): Promise<unknown> {
			return sendMock(cmd);
		}
	}
	class UpdateItemCommand {
		input: Record<string, unknown>;
		constructor(args: Record<string, unknown>) {
			this.input = args;
		}
	}
	return { DynamoDBClient, UpdateItemCommand };
});

import { handler } from '../infra/hits.mjs';

type LambdaResponse = {
	statusCode: number;
	headers?: Record<string, string>;
	body: string;
};

type LambdaEvent = {
	requestContext?: { http?: { method?: string } };
};

function invoke(event: LambdaEvent): Promise<LambdaResponse> {
	return handler(event) as Promise<LambdaResponse>;
}

function getEvent(method = 'GET'): LambdaEvent {
	return { requestContext: { http: { method } } };
}

beforeEach(() => {
	sendMock.mockReset();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('hits handler', () => {
	it('increments and returns the post-increment count on GET', async () => {
		sendMock.mockResolvedValueOnce({ Attributes: { count: { N: '42' } } });

		const res = await invoke(getEvent());

		expect(res.statusCode).toBe(200);
		expect(sendMock).toHaveBeenCalledTimes(1);
		const body = JSON.parse(res.body);
		expect(body.count).toBe(42);
		expect(typeof body.ts).toBe('string');
		expect(Number.isNaN(Date.parse(body.ts))).toBe(false);
	});

	it('issues an atomic ADD against the configured table', async () => {
		sendMock.mockResolvedValueOnce({ Attributes: { count: { N: '1' } } });

		await invoke(getEvent());

		const cmd = sendMock.mock.calls[0]?.[0] as { input: Record<string, unknown> };
		expect(cmd.input.TableName).toBe('test-hits-table');
		expect(cmd.input.UpdateExpression).toBe('ADD #c :one');
		expect(cmd.input.ReturnValues).toBe('UPDATED_NEW');
		expect(cmd.input.Key).toEqual({ pk: { S: 'hits' } });
		// Without these the ADD expression's #c/:one placeholders are unbound and
		// the real UpdateItem call is rejected by DynamoDB.
		expect(cmd.input.ExpressionAttributeNames).toEqual({ '#c': 'count' });
		expect(cmd.input.ExpressionAttributeValues).toEqual({ ':one': { N: '1' } });
	});

	it('sets no-store cache headers so counts never serve stale', async () => {
		sendMock.mockResolvedValueOnce({ Attributes: { count: { N: '1' } } });

		const res = await invoke(getEvent());

		expect(res.headers?.['Content-Type']).toBe('application/json; charset=utf-8');
		expect(res.headers?.['Cache-Control']).toBe('no-store, no-cache, must-revalidate');
	});

	it('defaults a missing count attribute to 0 rather than NaN', async () => {
		sendMock.mockResolvedValueOnce({ Attributes: {} });

		const res = await invoke(getEvent());

		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.body).count).toBe(0);
	});

	it.each(['POST', 'PUT', 'DELETE', 'HEAD'])(
		'rejects %s with 405 and never touches the table',
		async (method) => {
			const res = await invoke(getEvent(method));

			expect(res.statusCode).toBe(405);
			expect(JSON.parse(res.body)).toEqual({ error: 'method not allowed' });
			expect(sendMock).not.toHaveBeenCalled();
		},
	);

	it('defaults to GET when the method is absent from the event', async () => {
		sendMock.mockResolvedValueOnce({ Attributes: { count: { N: '7' } } });

		const res = await invoke({});

		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.body).count).toBe(7);
	});

	it('returns 500 and logs a structured line when DynamoDB fails', async () => {
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		sendMock.mockRejectedValueOnce(
			Object.assign(new Error('boom'), {
				name: 'ProvisionedThroughputExceededException',
				$metadata: { httpStatusCode: 400 },
			}),
		);

		const res = await invoke(getEvent());

		expect(res.statusCode).toBe(500);
		expect(JSON.parse(res.body)).toEqual({ error: 'counter unavailable' });
		const logged = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
		expect(logged.msg).toBe('hits ddb update failed');
		expect(logged.errName).toBe('ProvisionedThroughputExceededException');
		expect(logged.errCode).toBe(400);
	});

	it('falls back to Error/null when a non-AWS rejection lacks name and metadata', async () => {
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		// A failure originating outside the AWS SDK (e.g. a raw rejected value
		// with no `name` and no `$metadata` envelope) must still log cleanly.
		sendMock.mockRejectedValueOnce({ message: 'connection reset' });

		const res = await invoke(getEvent());

		expect(res.statusCode).toBe(500);
		expect(JSON.parse(res.body)).toEqual({ error: 'counter unavailable' });
		const logged = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
		expect(logged.msg).toBe('hits ddb update failed');
		expect(logged.errName).toBe('Error');
		expect(logged.errCode).toBe(null);
	});
});
