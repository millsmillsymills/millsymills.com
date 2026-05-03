resource "aws_cloudfront_function" "index_rewrite" {
  name    = "${replace(var.domain, ".", "-")}-index-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Rewrite directory URIs to the corresponding index.html"
  publish = true
  code    = file("${path.module}/cloudfront_function_index.js")
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
      content_security_policy = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests"
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
  # `infra/inspector_tls.tf` for the function + URL.
  origin {
    domain_name = local.inspector_tls_origin_host
    origin_id   = "lambda-${local.inspector_tls_name}"

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

  # /api/tls/* → inspector_tls Lambda. Uses the AWS-managed origin-request
  # policy "Managed-AllViewerAndCloudFrontHeaders-2022-06" so the
  # CloudFront-Viewer-TLS header survives the origin hop. CachingDisabled
  # cache policy because the response is per-connection live data.
  ordered_cache_behavior {
    path_pattern           = "/api/tls/*"
    target_origin_id       = "lambda-${local.inspector_tls_name}"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    viewer_protocol_policy = "https-only"
    compress               = true

    # AWS-managed CachingDisabled
    cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    # AWS-managed Managed-AllViewerAndCloudFrontHeaders-2022-06
    origin_request_policy_id = "33f36d7e-f396-46d9-90e0-52428a34d9dc"
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
