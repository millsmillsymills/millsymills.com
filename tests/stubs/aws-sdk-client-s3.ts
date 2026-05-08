// Test-only stub for `@aws-sdk/client-s3`. The SDK is part of the
// Lambda runtime (see `infra/csp_report.mjs`) and is not a project
// dependency, so vitest cannot resolve it. The vitest config aliases
// the import to this file; tests further override `S3Client.send`
// via `vi.mock`.
export class S3Client {
	send(_cmd: unknown): Promise<unknown> {
		return Promise.resolve({});
	}
}

export class PutObjectCommand {
	input: Record<string, unknown>;

	constructor(input: Record<string, unknown>) {
		this.input = input;
	}
}
