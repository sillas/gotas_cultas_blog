import { CfnOutput, Duration, Fn, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export interface CdnStackProps extends StackProps {
  isEphemeral: boolean;
  /**
   * Fixed name for the images bucket, chosen in bin/app.ts *before* any
   * stack is created. Needed so ApiStack (built before this stack, since
   * this stack needs its httpApi) can grant the uploads Lambda access by
   * ARN without holding a reference to the actual Bucket construct — see
   * the comment below on why the bucket itself can't live in its own stack.
   */
  imagesBucketName: string;
  /** Known after setup:sync; used to restrict direct presigned S3 uploads. */
  siteUrl?: string;
  httpApi: apigwv2.HttpApi;
  /**
   * Optional — only set once the domain is actually registered in Route 53
   * (PROJECT_SPEC.md section 13.6). Without it, the distribution is reachable
   * at its default *.cloudfront.net domain, which is enough to develop against.
   */
  domain?: {
    domainName: string;
    hostedZoneId: string;
    hostedZoneName: string;
    /** Must already exist in us-east-1 — see bin/app.ts. */
    certificateArn: string;
  };
}

export class CdnStack extends Stack {
  public readonly distributionDomainName: string;
  public readonly webBucket: s3.Bucket;
  public readonly imagesBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: CdnStackProps) {
    super(scope, id, props);

    // Both buckets live in the SAME stack as the Distribution on purpose:
    // S3BucketOrigin.withOriginAccessControl() writes a bucket policy that
    // references the distribution's ID, and a bucket policy is a resource
    // in the *bucket's* stack. If the bucket lived in a separate stack,
    // that stack would depend on this one for the distribution ID while
    // this one depends on it for the bucket — a cyclic stack dependency
    // CloudFormation refuses to deploy. Keeping them together sidesteps it
    // entirely instead of hand-rolling the OAC policy wiring.
    this.webBucket = new s3.Bucket(this, "WebBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      // Rollback safety net for a bad deploy (PROJECT_SPEC.md section 13.7).
      versioned: true,
      removalPolicy: props.isEphemeral ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      autoDeleteObjects: props.isEphemeral,
    });

    this.imagesBucket = new s3.Bucket(this, "ImagesBucket", {
      bucketName: props.imagesBucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: props.isEphemeral ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      autoDeleteObjects: props.isEphemeral,
      cors: props.siteUrl
        ? [{ allowedMethods: [s3.HttpMethods.PUT], allowedOrigins: [props.siteUrl], allowedHeaders: ["*"] }]
        : undefined,
    });

    // Strips the leading /api so CloudFront forwards e.g. /api/posts as
    // /posts to the HTTP API, whose routes don't know about the /api prefix.
    const stripApiPrefixFunction = new cloudfront.Function(this, "StripApiPrefixFunction", {
      code: cloudfront.FunctionCode.fromInline(`
        function handler(event) {
          var request = event.request;
          request.uri = request.uri.replace(/^\\/api/, '') || '/';
          return request;
        }
      `),
    });

    // SPA fallback for the admin app: any /admin/* request that isn't an
    // actual static asset (no "." in the last segment) serves index.html so
    // client-side routing (react-router) can take over.
    const adminSpaFallbackFunction = new cloudfront.Function(this, "AdminSpaFallbackFunction", {
      code: cloudfront.FunctionCode.fromInline(`
        function handler(event) {
          var request = event.request;
          if (!request.uri.includes('.')) {
            request.uri = '/admin/index.html';
          }
          return request;
        }
      `),
    });

    // Astro emits clean routes as /route/index.html. S3 REST origins do not
    // perform that directory-index lookup, so normalize public requests here.
    const publicRouteFunction = new cloudfront.Function(this, "PublicRouteFunction", {
      code: cloudfront.FunctionCode.fromInline(`
        function handler(event) {
          var request = event.request;
          if (request.uri.endsWith('/')) request.uri += 'index.html';
          else if (!request.uri.split('/').pop().includes('.')) request.uri += '/index.html';
          return request;
        }
      `),
    });

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, "SecurityHeaders", {
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          override: true,
          contentSecurityPolicy: "default-src 'self'; img-src 'self' https: data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
        strictTransportSecurity: { accessControlMaxAge: Duration.days(365), includeSubdomains: true, preload: true, override: true },
        xssProtection: { protection: true, modeBlock: true, override: true },
      },
    });

    const webOrigin = origins.S3BucketOrigin.withOriginAccessControl(this.webBucket);
    const imagesOrigin = origins.S3BucketOrigin.withOriginAccessControl(this.imagesBucket);

    const apiDomainName = Fn.select(2, Fn.split("/", props.httpApi.apiEndpoint));
    const apiOrigin = new origins.HttpOrigin(apiDomainName, {
      originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
    });

    const certificate = props.domain
      ? acm.Certificate.fromCertificateArn(this, "Certificate", props.domain.certificateArn)
      : undefined;

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: webOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
        functionAssociations: [
          { function: publicRouteFunction, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: {
        "/admin/*": {
          origin: webOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy: securityHeaders,
          functionAssociations: [
            { function: adminSpaFallbackFunction, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
          ],
        },
        "/images/*": {
          origin: imagesOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        "/api/*": {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          functionAssociations: [
            { function: stripApiPrefixFunction, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
          ],
        },
      },
      defaultRootObject: "index.html",
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 404, responsePagePath: "/404.html", ttl: Duration.minutes(5) },
        { httpStatus: 404, responseHttpStatus: 404, responsePagePath: "/404.html", ttl: Duration.minutes(5) },
      ],
      domainNames: props.domain ? [props.domain.domainName] : undefined,
      certificate,
    });

    this.distributionDomainName = distribution.distributionDomainName;

    if (props.domain) {
      const zone = route53.HostedZone.fromHostedZoneAttributes(this, "Zone", {
        hostedZoneId: props.domain.hostedZoneId,
        zoneName: props.domain.hostedZoneName,
      });

      new route53.ARecord(this, "AliasRecord", {
        zone,
        recordName: props.domain.domainName,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      });
    }

    new CfnOutput(this, "DistributionDomainName", { value: distribution.distributionDomainName });
    new CfnOutput(this, "DistributionId", { value: distribution.distributionId });
    new CfnOutput(this, "WebBucketName", { value: this.webBucket.bucketName });
    new CfnOutput(this, "ImagesBucketName", { value: this.imagesBucket.bucketName });
  }
}
