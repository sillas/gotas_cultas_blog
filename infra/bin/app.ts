#!/usr/bin/env node
import { App, Stack } from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as budgets from "aws-cdk-lib/aws-budgets";
import { DataStack } from "../lib/data-stack";
import { AuthStack } from "../lib/auth-stack";
import { ApiStack } from "../lib/api-stack";
import { CdnStack } from "../lib/cdn-stack";

const app = new App();

const stage = app.node.tryGetContext("stage") as string | undefined;
if (stage !== "homolog" && stage !== "production") {
  throw new Error("Pass -c stage=homolog or -c stage=production");
}
const isEphemeral = stage === "homolog";
const stackPrefix = stage === "homolog" ? "BlogHomolog" : "BlogProduction";

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// All of these are optional at this stage — PROJECT_SPEC.md section 13.6
// deliberately treats "domain registered in Route 53" as a step that can
// happen after the base infra is already synthesizable/deployable.
// Pass real values with: cdk deploy -c domainName=blog.com -c hostedZoneId=Z... -c hostedZoneName=blog.com -c githubRepo=user/blog
const domainName = app.node.tryGetContext("domainName") as string | undefined;
const hostedZoneId = app.node.tryGetContext("hostedZoneId") as string | undefined;
const hostedZoneName = app.node.tryGetContext("hostedZoneName") as string | undefined;
const githubRepo = (app.node.tryGetContext("githubRepo") as string | undefined) ?? "CHANGEME/blog";
const cognitoDomainPrefix =
  (app.node.tryGetContext("cognitoDomainPrefix") as string | undefined) ?? "changeme-blog-admin";
const alarmEmail = app.node.tryGetContext("alarmEmail") as string | undefined;
const monthlyBudgetUsd = Number(app.node.tryGetContext("monthlyBudgetUsd") ?? 10);
const previousSiteUrl = app.node.tryGetContext("siteUrl") as string | undefined;

const hasDomain = Boolean(domainName && hostedZoneId && hostedZoneName);

// Decided here, before any stack exists, so both ApiStack and CdnStack can
// agree on the images bucket's name without either holding a reference to
// the other's constructs (see cdn-stack.ts and api-stack.ts for why the
// bucket can't simply be created in its own stack and passed around).
const imagesBucketName = `blog-images-${stage}-${env.account ?? "dev"}`;

// ACM certificates used by CloudFront must live in us-east-1 regardless of
// where the rest of the stack is deployed.
let certificateArn: string | undefined;
if (hasDomain) {
  const certStack = new Stack(app, `${stackPrefix}CertStack`, {
    env: { account: env.account, region: "us-east-1" },
    crossRegionReferences: true,
  });
  const zone = route53.HostedZone.fromHostedZoneAttributes(certStack, "Zone", {
    hostedZoneId: hostedZoneId!,
    zoneName: hostedZoneName!,
  });
  const certificate = new acm.Certificate(certStack, "Certificate", {
    domainName: domainName!,
    validation: acm.CertificateValidation.fromDns(zone),
  });
  certificateArn = certificate.certificateArn;
}

const dataStack = new DataStack(app, `${stackPrefix}DataStack`, { env, isEphemeral });

if (alarmEmail) {
  const costStack = new Stack(app, `${stackPrefix}CostStack`, { env });
  new budgets.CfnBudget(costStack, "MonthlyBudget", {
    budget: { budgetType: "COST", timeUnit: "MONTHLY", budgetLimit: { amount: monthlyBudgetUsd, unit: "USD" } },
    notificationsWithSubscribers: [{
      notification: { notificationType: "FORECASTED", comparisonOperator: "GREATER_THAN", threshold: 80, thresholdType: "PERCENTAGE" },
      subscribers: [{ subscriptionType: "EMAIL", address: alarmEmail }],
    }],
  });
}

const resolvedSiteUrl = hasDomain ? `https://${domainName}` : previousSiteUrl?.replace(/\/$/, "");
const adminBaseUrl = resolvedSiteUrl ? `${resolvedSiteUrl}/admin` : "http://localhost:5173/admin";

const authStack = new AuthStack(app, `${stackPrefix}AuthStack`, {
  env,
  isEphemeral,
  cognitoDomainPrefix,
  adminBaseUrl,
});

const apiStack = new ApiStack(app, `${stackPrefix}ApiStack`, {
  env,
  table: dataStack.table,
  imagesBucketName,
  userPool: authStack.userPool,
  userPoolClient: authStack.userPoolClient,
  githubRepo,
  deployStage: stage,
  publicImagesBaseUrl: hasDomain ? `https://${domainName}/images` : "/images",
  alarmEmail,
  // Without a custom domain the final CloudFront hostname only exists after
  // this deployment. API routes are still requested through the same
  // CloudFront origin (/api); wildcard CORS lets API Gateway answer browser
  // preflights until setup:sync binds Cognito to that generated hostname.
  // Private operations remain protected by the Cognito authorizer.
  allowedOrigins: resolvedSiteUrl ? [resolvedSiteUrl] : ["*"],
});

new CdnStack(app, `${stackPrefix}CdnStack`, {
  env,
  isEphemeral,
  crossRegionReferences: hasDomain,
  imagesBucketName,
  httpApi: apiStack.httpApi,
  domain: hasDomain
    ? {
        domainName: domainName!,
        hostedZoneId: hostedZoneId!,
        hostedZoneName: hostedZoneName!,
        certificateArn: certificateArn!,
      }
    : undefined,
});
