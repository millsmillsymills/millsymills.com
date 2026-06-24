// Test-only stub for `@aws-sdk/client-dynamodb`. The SDK is part of the
// Lambda runtime (see `infra/hits.mjs`) and is not a project dependency,
// so vitest cannot resolve it. The vitest config aliases the import to
// this file; tests further override `DynamoDBClient.send` via `vi.mock`.
export class DynamoDBClient {
	send(_cmd: unknown): Promise<unknown> {
		return Promise.resolve({});
	}
}

export class UpdateItemCommand {
	input: Record<string, unknown>;

	constructor(input: Record<string, unknown>) {
		this.input = input;
	}
}
