resource "aws_cloudfront_function" "index_rewrite" {
  name    = "${replace(var.domain, ".", "-")}-index-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Rewrite directory URIs to the corresponding index.html"
  publish = true
  code    = file("${path.module}/cloudfront_function_index.js")
}

# Origin request policy for the inspector_tls Lambda Function URL.
#
# Lambda Function URLs reject any request whose Host header does not
# match `<id>.lambda-url.<region>.on.aws` with 403. CloudFront's
# AWS-managed `Managed-AllViewerAndCloudFrontHeaders-2022-06` forwards
# the viewer's Host (e.g. `millsymills.com`) verbatim, so the Lambda
# answers every CloudFront request with 403, which CloudFront's
# custom_error_response then masks as the static /404.html page.
#
# Use `whitelist` mode so CloudFront rewrites Host to the origin's
# hostname (the default when Host isn't explicitly forwarded) and only
# forwards the two headers the Lambda actually reads:
# `CloudFront-Viewer-TLS` (the negotiated TLS state we want to surface)
# and `Origin` (used for the CORS allow-origin echo).
resource "aws_cloudfront_origin_request_policy" "inspector_tls" {
  name    = "${replace(var.domain, ".", "-")}-inspector-tls-origin-req"
  comment = "Forward CloudFront-Viewer-TLS + Origin to the inspector_tls Lambda; let CloudFront rewrite Host"

  headers_config {
    header_behavior = "whitelist"
    headers {
      items = ["CloudFront-Viewer-TLS", "Origin"]
    }
  }

  cookies_config {
    cookie_behavior = "none"
  }

  query_strings_config {
    query_string_behavior = "none"
  }
}

# Origin-request policy for the CSP report endpoint Lambda. Same Host
# rewrite rationale as inspector_tls — Lambda Function URLs reject any
# Host header that does not match `<id>.lambda-url.<region>.on.aws`.
# Whitelist mode forwards only the headers the handler reads:
#   * `Content-Type` — distinguishes the legacy `application/csp-report`
#     payload from the modern `application/reports+json` Reporting API
#     payload (and the older Firefox `application/json` quirk).
#   * `User-Agent` — kept in the persisted envelope for diagnostic context.
#   * `CloudFront-Viewer-Country` — coarse geo signal added by CloudFront;
#     also persisted in the envelope. Not forwarded to origins by default,
#     so it must be in the whitelist explicitly.
# Host is intentionally omitted so CloudFront rewrites it to the Lambda
# Function URL hostname.
resource "aws_cloudfront_origin_request_policy" "csp_report" {
  name    = "${replace(var.domain, ".", "-")}-csp-report-origin-req"
  comment = "Forward Content-Type, User-Agent, CloudFront-Viewer-Country to csp_report Lambda; let CloudFront rewrite Host"

  headers_config {
    header_behavior = "whitelist"
    headers {
      items = ["Content-Type", "User-Agent", "CloudFront-Viewer-Country"]
    }
  }

  cookies_config {
    cookie_behavior = "none"
  }

  query_strings_config {
    query_string_behavior = "none"
  }
}

resource "aws_cloudfront_response_headers_policy" "site" {
  name    = "${replace(var.domain, ".", "-")}-security-headers"
  comment = "Security headers for ${var.domain}"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "SAMEORIGIN"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    content_security_policy {
      # `report-uri` is the legacy directive (older browsers); `report-to csp`
      # is the modern Reporting API form, paired with the `Reporting-Endpoints`
      # custom header below. Both forms target the same /api/csp-report
      # endpoint so violations are captured regardless of browser vintage.
      content_security_policy = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests; report-uri /api/csp-report; report-to csp"
      override                = true
    }
  }

  # Cross-origin isolation. The site is fully same-origin (no third-party
  # scripts, fonts, images, iframes), so `require-corp` + `same-origin` CORP
  # is enforceable today without breaking subresources. Spectre-class
  # mitigation + signals readiness for SharedArrayBuffer-using features.
  # AWS CloudFront's first-class `security_headers_config` doesn't expose
  # COOP/COEP/CORP yet — they ship via custom_headers_config.
  custom_headers_config {
    items {
      header   = "Cross-Origin-Opener-Policy"
      value    = "same-origin"
      override = true
    }

    items {
      header   = "Cross-Origin-Embedder-Policy"
      value    = "require-corp"
      override = true
    }

    items {
      header   = "Cross-Origin-Resource-Policy"
      value    = "same-origin"
      override = true
    }

    # Reporting API endpoints group. Pairs with the `report-to csp`
    # directive in the CSP above. The same /api/csp-report endpoint is
    # also referenced by the legacy `report-uri` directive; modern
    # browsers prefer Reporting-Endpoints, older ones fall back to
    # report-uri. Spec: https://w3c.github.io/reporting/.
    items {
      header   = "Reporting-Endpoints"
      value    = "csp=\"https://${var.domain}/api/csp-report\""
      override = true
    }

    # Permissions-Policy. Strict-deny baseline for every powerful feature the
    # site does not use. The site is a static personal page with zero JS use
    # of geolocation, camera/mic, USB/serial/HID, payments, fullscreen, etc.
    # — verified by greppping `navigator.*` in src/. Each feature is denied
    # for both top-level and embedded contexts via `=()`. New features that
    # ever ship (e.g. WebAuthn demo #140, theater-mode fullscreen) must
    # update this policy in the same PR; otherwise the API call no-ops
    # silently. Inspector grades A at >=5 directives — we ship 36.
    # `assert-permissions-policy.sh` enforces both the count floor and the
    # value shape: every directive must be `=()` (deny) or `=(self)`
    # (self-allow), so a future "fix" that flips to `=*` fails CI.
    items {
      header   = "Permissions-Policy"
      value    = "accelerometer=(), attribution-reporting=(), autoplay=(), bluetooth=(), browsing-topics=(), camera=(), clipboard-read=(), clipboard-write=(), compute-pressure=(), display-capture=(), encrypted-media=(), fullscreen=(), gamepad=(), geolocation=(), gyroscope=(), hid=(), idle-detection=(), local-fonts=(), magnetometer=(), microphone=(), midi=(), otp-credentials=(), payment=(), picture-in-picture=(), publickey-credentials-create=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), speaker-selection=(), storage-access=(), sync-xhr=(), unload=(), usb=(), web-share=(), window-management=(), xr-spatial-tracking=()"
      override = true
    }
  }
}

# Response-headers policy for the /api/tls/* JSON endpoint. Authored
# separately from the document policy (`site` above) because:
#
#   1. The site policy ships `Cross-Origin-Resource-Policy: same-origin`
#      and `Cross-Origin-Embedder-Policy: require-corp`. With those on
#      a JSON response, an allowlisted cross-origin caller (e.g.
#      `p41m0n.com` — see ALLOWED_ORIGINS in inspector_tls.mjs) gets
#      blocked at the browser layer even after CORS preflight succeeds,
#      because COEP-isolated pages can only embed `cross-origin` CORP
#      resources or pre-flighted CORS resources marked compatible.
#   2. CSP is a document directive — browsers ignore it on `application/json`.
#      Shipping `default-src 'self'` on API responses adds noise without
#      protection.
#   3. COOP/COEP describe the requesting document's agent cluster, not
#      the data response. Stripping them off API responses is correct.
#
# We keep the per-response defenses that DO apply to JSON: HSTS, nosniff,
# Referrer-Policy, and the Permissions-Policy strict-deny baseline (a
# policy header on a JSON response still scopes any same-origin nav that
# happens to inherit from it, and shipping it consistently keeps the
# /security/ promise honest across response classes).
resource "aws_cloudfront_response_headers_policy" "api" {
  name    = "${replace(var.domain, ".", "-")}-api-headers"
  comment = "Security headers for ${var.domain} JSON APIs (CORP cross-origin)"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }

    content_type_options {
      override = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }

  custom_headers_config {
    # CORP `cross-origin` so allowlisted cross-origin pages (currently the
    # `p41m0n.com` rehearsal stack) can fetch /api/tls/inspect from a
    # COEP-isolated document. The CORS allowlist in inspector_tls.mjs
    # remains the actual access boundary — CORP `cross-origin` only
    # opens the browser-side embedding gate; the Lambda still echoes
    # `access-control-allow-origin` for allowlisted origins only.
    items {
      header   = "Cross-Origin-Resource-Policy"
      value    = "cross-origin"
      override = true
    }

    items {
      header   = "Permissions-Policy"
      value    = "accelerometer=(), attribution-reporting=(), autoplay=(), bluetooth=(), browsing-topics=(), camera=(), clipboard-read=(), clipboard-write=(), compute-pressure=(), display-capture=(), encrypted-media=(), fullscreen=(), gamepad=(), geolocation=(), gyroscope=(), hid=(), idle-detection=(), local-fonts=(), magnetometer=(), microphone=(), midi=(), otp-credentials=(), payment=(), picture-in-picture=(), publickey-credentials-create=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), speaker-selection=(), storage-access=(), sync-xhr=(), unload=(), usb=(), web-share=(), window-management=(), xr-spatial-tracking=()"
      override = true
    }
  }
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = [var.domain, "www.${var.domain}"]
  price_class         = "PriceClass_100" # US/EU only — cheapest

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "s3-${var.domain}"
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  # Lambda Function URL origin for the /inspector/ TLS readout. See
  # `infra/inspector_tls.tf` for the function + URL. The OAC sigv4-signs
  # every origin request so the Function URL can run with
  # authorization_type = AWS_IAM and reject the public bypass path.
  origin {
    domain_name              = local.inspector_tls_origin_host
    origin_id                = "lambda-${local.inspector_tls_name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.inspector_tls.id

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Lambda Function URL origin for the /api/csp-report endpoint. See
  # `infra/csp_report.tf` for the function + URL. Same OAC pattern as
  # inspector_tls — public bypass closed at the AWS_IAM auth boundary.
  origin {
    domain_name              = local.csp_report_origin_host
    origin_id                = "lambda-${local.csp_report_name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.csp_report.id

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-${var.domain}"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    # AWS-managed CachingOptimized
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.site.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.index_rewrite.arn
    }
  }

  # /api/tls/* → inspector_tls Lambda. CachingDisabled cache policy because
  # the response is per-connection live data. Uses our custom origin-request
  # policy `inspector_tls` (defined below) — we can't use the AWS-managed
  # AllViewerAndCloudFrontHeaders here because Lambda Function URLs enforce
  # Host header match against their own URL, and that managed policy forwards
  # the viewer's Host (e.g. millsymills.com) → Lambda 403 → CloudFront's
  # custom_error_response substitutes /404.html.
  ordered_cache_behavior {
    path_pattern           = "/api/tls/*"
    target_origin_id       = "lambda-${local.inspector_tls_name}"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    viewer_protocol_policy = "https-only"
    compress               = true

    # AWS-managed CachingDisabled
    cache_policy_id            = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    origin_request_policy_id   = aws_cloudfront_origin_request_policy.inspector_tls.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.api.id
  }

  # /api/csp-report → csp_report Lambda. POST is the only meaningful
  # method (browsers POST violation reports here); other methods are
  # rejected by the Lambda with 405 but are routed in the cache
  # behavior so they get the CloudFront security headers rather than
  # falling back to the default behavior. CachingDisabled because POSTs
  # aren't cacheable anyway, and same-origin host rewrite uses our
  # custom `csp_report` origin-request policy for the same reason as
  # inspector_tls (Lambda Function URLs enforce Host header match).
  ordered_cache_behavior {
    path_pattern           = "/api/csp-report"
    target_origin_id       = "lambda-${local.csp_report_name}"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    viewer_protocol_policy = "https-only"
    compress               = true

    # AWS-managed CachingDisabled
    cache_policy_id            = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    origin_request_policy_id   = aws_cloudfront_origin_request_policy.csp_report.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.api.id
  }

  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.site.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.3_2025"
  }
}
