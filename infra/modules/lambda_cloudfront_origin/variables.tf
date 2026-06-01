# Inputs for the Lambda-behind-CloudFront-OAC origin module.
#
# Captures the scaffold shared by every "tiny Node.js Lambda exposed via a
# Function URL, locked to AWS_IAM, reached only through a CloudFront Origin
# Access Control" endpoint (inspector_tls, csp_report, hits). The caller
# supplies the handler + per-endpoint knobs and attaches any extra IAM
# policy to the exported role; everything else (archive, role, basic-exec
# attachment, log group, function, Function URL, OAC, the Oct-2025 dual
# CloudFront permission pair, and the origin host derivation) is identical
# and lives here.

variable "name" {
  type        = string
  description = "Resource name prefix, e.g. millsymills-com-hits. Used verbatim for the function, OAC, and log group; suffixed with -lambda for the role."
}

variable "enabled" {
  type        = bool
  description = "Gate every resource on the caller's enable_* toggle (count = enabled ? 1 : 0)."
}

variable "source_file" {
  type        = string
  description = "Absolute path to the handler .mjs (caller passes path.module-relative source from the root module)."
}

variable "handler" {
  type        = string
  description = "Lambda handler, e.g. hits.handler."
}

variable "distribution_arn" {
  type        = string
  description = "ARN of the CloudFront distribution allowed to invoke the Function URL. Scopes both lambda permissions' source_arn."
}

variable "log_retention_days" {
  type        = number
  default     = 30
  description = "CloudWatch log group retention. inspector_tls uses 14; hits/csp use 30."
}

variable "environment" {
  type        = map(string)
  default     = {}
  description = "Lambda environment variables. Empty map omits the environment block (inspector_tls has none)."
}

variable "reserved_concurrent_executions" {
  type        = number
  default     = -1
  description = "Bill-cap on concurrency. -1 (the AWS default) leaves it unreserved (inspector_tls); hits uses 10, csp uses 5."
}

variable "runtime" {
  type        = string
  default     = "nodejs22.x"
  description = "Lambda runtime identifier."
}

variable "memory_size" {
  type        = number
  default     = 128
  description = "Function memory in MB. 128 suits these pennies/year micro-Lambdas."
}

variable "timeout" {
  type        = number
  default     = 5
  description = "Function timeout in seconds."
}

variable "architectures" {
  type        = list(string)
  default     = ["arm64"]
  description = "Instruction set; arm64 (Graviton) is cheaper for this workload."
}
