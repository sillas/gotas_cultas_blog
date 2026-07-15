#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url).pathname;
const CONFIG_PATH = `${ROOT}project.config.json`;
const command = process.argv[2] ?? "help";
const confirmed = process.argv.includes("--yes");

function run(bin, args, options = {}) {
  return execFileSync(bin, args, { cwd: ROOT, encoding: "utf8", stdio: options.capture ? "pipe" : "inherit", ...options }).trim();
}

function capture(bin, args) {
  return run(bin, args, { capture: true });
}

function requireConfirmation(action) {
  if (!confirmed) throw new Error(`${action} changes external state. Review the command and run it again with --yes.`);
}

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) throw new Error("project.config.json not found. Copy project.config.example.json and fill it first.");
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  const required = ["aws.accountId", "aws.region", "github.repository"];
  for (const path of required) {
    const value = path.split(".").reduce((current, key) => current?.[key], config);
    if (!value || /^(123456789012|owner\/repository)$/.test(String(value))) throw new Error(`Invalid or missing ${path}`);
  }
  if (!/^\d{12}$/.test(String(config.aws.accountId))) throw new Error("aws.accountId must have 12 digits");
  return config;
}

function assertIdentities(config) {
  const awsIdentity = JSON.parse(capture("aws", ["sts", "get-caller-identity", "--output", "json"]));
  if (awsIdentity.Account !== String(config.aws.accountId)) {
    throw new Error(`AWS CLI is authenticated in account ${awsIdentity.Account}, expected ${config.aws.accountId}`);
  }
  run("gh", ["auth", "status"]);
  const repo = JSON.parse(capture("gh", ["repo", "view", config.github.repository, "--json", "nameWithOwner"]));
  if (repo.nameWithOwner.toLowerCase() !== config.github.repository.toLowerCase()) throw new Error("GitHub repository mismatch");
  return awsIdentity;
}

function hostedZone(config) {
  if (!config.domain?.name) return null;
  if (!config.domain.hostedZoneName) throw new Error("domain.hostedZoneName is required when domain.name is set");
  const result = JSON.parse(capture("aws", ["route53", "list-hosted-zones-by-name", "--dns-name", config.domain.hostedZoneName, "--max-items", "1", "--output", "json"]));
  const zone = result.HostedZones?.[0];
  if (!zone || zone.Name.replace(/\.$/, "") !== config.domain.hostedZoneName) throw new Error(`Hosted zone ${config.domain.hostedZoneName} not found`);
  return zone.Id.replace("/hostedzone/", "");
}

function check() {
  const config = loadConfig();
  const identity = assertIdentities(config);
  const zoneId = hostedZone(config);
  let bootstrap = "missing";
  try { capture("aws", ["cloudformation", "describe-stacks", "--stack-name", "CDKToolkit", "--region", config.aws.region]); bootstrap = "ready"; } catch {}
  console.log(JSON.stringify({ awsAccount: identity.Account, region: config.aws.region, repository: config.github.repository, hostedZoneId: zoneId, cdkBootstrap: bootstrap }, null, 2));
}

function oidcProviderArn(config) {
  const arn = `arn:aws:iam::${config.aws.accountId}:oidc-provider/token.actions.githubusercontent.com`;
  const providers = JSON.parse(capture("aws", ["iam", "list-open-id-connect-providers", "--output", "json"]));
  return providers.OpenIDConnectProviderList?.some((provider) => provider.Arn === arn) ? arn : null;
}

function bootstrap() {
  requireConfirmation("Bootstrap");
  const config = loadConfig();
  assertIdentities(config);
  run("npx", ["cdk", "bootstrap", `aws://${config.aws.accountId}/${config.aws.region}`], { cwd: `${ROOT}infra` });

  const providerArn = oidcProviderArn(config) ?? capture("aws", ["iam", "create-open-id-connect-provider", "--url", "https://token.actions.githubusercontent.com", "--client-id-list", "sts.amazonaws.com", "--thumbprint-list", "6938fd4d98bab03faadb97b34396831e3780aea1", "--query", "OpenIDConnectProviderArn", "--output", "text"]);
  const roleName = "TheBlogBaseGitHubActionsRole";
  const trust = JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Federated: providerArn }, Action: "sts:AssumeRoleWithWebIdentity", Condition: { StringEquals: { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" }, StringLike: { "token.actions.githubusercontent.com:sub": `repo:${config.github.repository}:*` } } }] });
  try {
    run("aws", ["iam", "create-role", "--role-name", roleName, "--assume-role-policy-document", trust]);
  } catch {
    run("aws", ["iam", "update-assume-role-policy", "--role-name", roleName, "--policy-document", trust]);
  }
  const policy = JSON.stringify({ Version: "2012-10-17", Statement: [
    { Effect: "Allow", Action: ["sts:AssumeRole"], Resource: `arn:aws:iam::${config.aws.accountId}:role/cdk-*` },
    { Effect: "Allow", Action: ["cloudformation:DescribeStacks", "cloudformation:ListStackResources", "cloudfront:CreateInvalidation"], Resource: "*" },
    { Effect: "Allow", Action: ["dynamodb:Query", "dynamodb:Scan", "dynamodb:DescribeTable"], Resource: [`arn:aws:dynamodb:${config.aws.region}:${config.aws.accountId}:table/*`, `arn:aws:dynamodb:${config.aws.region}:${config.aws.accountId}:table/*/index/*`] },
    { Effect: "Allow", Action: ["s3:ListBucket", "s3:GetBucketLocation"], Resource: "arn:aws:s3:::blog*" },
    { Effect: "Allow", Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource: "arn:aws:s3:::blog*/*" },
  ] });
  run("aws", ["iam", "put-role-policy", "--role-name", roleName, "--policy-name", "CdkBootstrapAccess", "--policy-document", policy]);
  console.log(`Bootstrap ready. GitHub role: arn:aws:iam::${config.aws.accountId}:role/${roleName}`);
}

function setVariable(repo, name, value) {
  if (value !== undefined && value !== null && String(value) !== "") run("gh", ["variable", "set", name, "--repo", repo, "--body", String(value)]);
}

function configureGitHub() {
  requireConfirmation("GitHub configuration");
  const config = loadConfig();
  assertIdentities(config);
  const zoneId = hostedZone(config);
  const roleArn = `arn:aws:iam::${config.aws.accountId}:role/TheBlogBaseGitHubActionsRole`;
  const prefix = config.github.repository.split("/")[1].toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const variables = {
    AWS_ACCOUNT_ID: config.aws.accountId, AWS_REGION: config.aws.region, AWS_DEPLOY_ROLE_ARN: roleArn,
    COGNITO_DOMAIN_PREFIX: `${prefix}-admin`, DOMAIN_NAME: config.domain?.name, HOSTED_ZONE_ID: zoneId,
    HOSTED_ZONE_NAME: config.domain?.hostedZoneName, ALARM_EMAIL: config.operations?.alarmEmail,
    MONTHLY_BUDGET_USD: config.operations?.monthlyBudgetUsd,
  };
  for (const [name, value] of Object.entries(variables)) setVariable(config.github.repository, name, value);
  console.log("GitHub bootstrap variables configured.");
}

function stackOutputs(config, stackName) {
  const result = JSON.parse(capture("aws", ["cloudformation", "describe-stacks", "--stack-name", stackName, "--region", config.aws.region, "--output", "json"]));
  return Object.fromEntries((result.Stacks?.[0]?.Outputs ?? []).map(({ OutputKey, OutputValue }) => [OutputKey, OutputValue]));
}

function syncOutputs() {
  requireConfirmation("GitHub output synchronization");
  const config = loadConfig();
  assertIdentities(config);
  const data = stackOutputs(config, "BlogDataStack");
  const auth = stackOutputs(config, "BlogAuthStack");
  const api = stackOutputs(config, "BlogApiStack");
  const cdn = stackOutputs(config, "BlogCdnStack");
  const siteUrl = config.domain?.name ? `https://${config.domain.name}` : `https://${cdn.DistributionDomainName}`;
  const variables = {
    BLOG_TABLE_NAME: data.TableName, WEB_BUCKET_NAME: cdn.WebBucketName,
    CLOUDFRONT_DISTRIBUTION_ID: cdn.DistributionId, SITE_URL: siteUrl,
    PUBLIC_API_BASE_URL: `${siteUrl}/api`, COGNITO_DOMAIN: auth.CognitoDomain,
    COGNITO_CLIENT_ID: auth.UserPoolClientId, COGNITO_REDIRECT_URI: `${siteUrl}/admin/callback`,
    COGNITO_LOGOUT_REDIRECT_URI: `${siteUrl}/admin/login`,
  };
  for (const [name, value] of Object.entries(variables)) setVariable(config.github.repository, name, value);
  console.log("CloudFormation outputs synchronized to GitHub Variables.");
}

function dispatch(workflow) {
  requireConfirmation(`Workflow ${workflow}`);
  const config = loadConfig();
  assertIdentities(config);
  run("gh", ["workflow", "run", workflow, "--repo", config.github.repository, "--ref", "main"]);
  console.log(`Workflow ${workflow} dispatched. Follow with: gh run watch --repo ${config.github.repository}`);
}

async function dispatchAndWatch(workflow) {
  dispatch(workflow);
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const runs = JSON.parse(capture("gh", ["run", "list", "--repo", loadConfig().github.repository, "--workflow", workflow, "--limit", "1", "--json", "databaseId"]));
  if (!runs[0]?.databaseId) throw new Error(`Could not find the run for ${workflow}`);
  run("gh", ["run", "watch", String(runs[0].databaseId), "--repo", loadConfig().github.repository, "--exit-status"]);
}

function setupAdmin() {
  requireConfirmation("Admin setup");
  const config = loadConfig();
  assertIdentities(config);
  if (!config.admin?.email) throw new Error("admin.email is required");
  const auth = stackOutputs(config, "BlogAuthStack");
  const api = stackOutputs(config, "BlogApiStack");
  const token = capture("gh", ["auth", "token"]);
  run("aws", ["secretsmanager", "put-secret-value", "--secret-id", api.GitHubTokenSecretArn, "--secret-string", token, "--region", config.aws.region]);
  try {
    run("aws", ["cognito-idp", "admin-get-user", "--user-pool-id", auth.UserPoolId, "--username", config.admin.email, "--region", config.aws.region]);
  } catch {
    run("aws", ["cognito-idp", "admin-create-user", "--user-pool-id", auth.UserPoolId, "--username", config.admin.email, "--user-attributes", `Name=email,Value=${config.admin.email}`, "Name=email_verified,Value=true", "--region", config.aws.region]);
  }
  console.log("GitHub dispatch secret and Cognito admin configured.");
}

async function verify() {
  const config = loadConfig();
  assertIdentities(config);
  const cdn = stackOutputs(config, "BlogCdnStack");
  const base = config.domain?.name ? `https://${config.domain.name}` : `https://${cdn.DistributionDomainName}`;
  const checks = [["/", 200], ["/sobre", 200], ["/sitemap-index.xml", 200], ["/rss.xml", 200], ["/__missing__", 404], ["/admin/login", 200]];
  for (const [path, expected] of checks) {
    const response = await fetch(`${base}${path}`, { redirect: "manual" });
    if (response.status !== expected) throw new Error(`${path}: expected ${expected}, received ${response.status}`);
    console.log(`OK ${response.status} ${path}`);
  }
}

async function launch() {
  requireConfirmation("Full launch");
  bootstrap();
  configureGitHub();
  run("npm", ["run", "check"]);
  await dispatchAndWatch("deploy-infra.yml");
  syncOutputs();
  setupAdmin();
  await dispatchAndWatch("deploy-site.yml");
  await verify();
}

const commands = {
  check, bootstrap, "github:configure": configureGitHub, "github:sync-outputs": syncOutputs,
  "deploy:infra": () => dispatch("deploy-infra.yml"), "deploy:site": () => dispatch("deploy-site.yml"),
  "admin:setup": setupAdmin, verify, launch,
};

try {
  if (!commands[command]) {
    console.log("Usage: project-ops.mjs <check|bootstrap|github:configure|github:sync-outputs|deploy:infra|deploy:site|admin:setup|verify|launch> [--yes]");
    process.exit(command === "help" ? 0 : 1);
  }
  await commands[command]();
} catch (error) {
  console.error(`[project-ops] ${error.message}`);
  process.exit(1);
}
