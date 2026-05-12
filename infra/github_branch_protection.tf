# `main` branch protection — codifies the signed-commits + admin-included
# rule that previously lived only in the GitHub UI (set out-of-band per
# #375). With this resource managed in Terraform, `terraform plan` surfaces
# any silent toggle-off in the UI as drift the next run reports.
#
# Resource choice: `github_branch_protection_v3` (REST), not
# `github_branch_protection` (GraphQL). The REST resource is the one whose
# schema exposes `require_signed_commits` directly while also denying
# force-pushes and branch deletion intrinsically — its docs read "the
# branch will be protected from forced pushes and deletion" with no
# opt-out, which is exactly the desired posture for `main`. The GraphQL
# variant has separate `allows_force_pushes` / `allows_deletions` toggles
# (default-true) which would have to be flipped off explicitly; the v3
# defaults already match the intent so there's nothing to misconfigure.
#
# Not set: `required_linear_history` — defaults to false and #388 calls for
# false. Omitted for clarity rather than redundantly written.
#
# Scope of this resource: only the controls listed in issue #388 sub-task 1
# (signatures + admin enforcement + the implicit no-force-push / no-delete
# from v3). Required reviewers on environments (sub-task 2) and the
# scheduled `gh api` drift assertion (sub-task 3) are deliberately not in
# this file; they remain to be decided in followup work.

resource "github_branch_protection_v3" "main" {
  repository             = split("/", var.github_repo)[1]
  branch                 = var.deploy_branch
  enforce_admins         = true
  require_signed_commits = true
}
