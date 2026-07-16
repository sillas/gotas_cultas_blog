#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url).pathname;
const CONFIG_PATH = `${ROOT}project.config.json`;
const command = process.argv[2] ?? "help";
const confirmed = process.argv.includes("--yes");

function option(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const stageName = option("stage");

function run(bin, args, options = {}) {
  return execFileSync(bin, args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  }).trim();
}

function capture(bin, args, options = {}) {
  return run(bin, args, { ...options, capture: true });
}

function requireConfirmation(action) {
  if (!confirmed) throw new Error(`${action} changes external state. Review it and run again with --yes.`);
}

function loadProject() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error("project.config.json not found. Copy project.config.example.json and fill it first.");
  }
  const project = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  if (!project.github?.repository || project.github.repository === "owner/repository") {
    throw new Error("Invalid or missing github.repository");
  }
  const homolog = project.environments?.homolog;
  const production = project.environments?.production;
  if (!homolog || !production) throw new Error("Configure environments.homolog and environments.production");
  if (String(homolog.aws?.accountId) === String(production.aws?.accountId)) {
    throw new Error("Homologation and production must use different AWS accounts");
  }
  return project;
}

function context() {
  const project = loadProject();
  if (stageName !== "homolog" && stageName !== "production") {
    throw new Error("Pass --stage homolog or --stage production");
  }
  const environment = project.environments[stageName];
  if (!/^\d{12}$/.test(String(environment.aws?.accountId))) {
    throw new Error(`environments.${stageName}.aws.accountId must have 12 digits`);
  }
  if (!environment.aws?.region) throw new Error(`Missing environments.${stageName}.aws.region`);
  const expectedBranch = stageName === "homolog" ? "homolog" : "main";
  if (environment.branch !== expectedBranch) {
    throw new Error(`environments.${stageName}.branch must be ${expectedBranch}`);
  }
  return { project, environment, stage: stageName };
}

function stackPrefix(stage) {
  return stage === "homolog" ? "BlogHomolog" : "BlogProduction";
}

function roleName(stage) {
  return `TheBlogBaseGitHubActions${stage === "homolog" ? "Homolog" : "Production"}Role`;
}

function assertIdentities(ctx) {
  const identity = JSON.parse(capture("aws", ["sts", "get-caller-identity", "--output", "json"]));
  const expected = String(ctx.environment.aws.accountId);
  if (identity.Account !== expected) {
    throw new Error(`AWS CLI is authenticated in account ${identity.Account}, expected ${expected} for ${ctx.stage}`);
  }
  run("gh", ["auth", "status"]);
  const repo = JSON.parse(capture("gh", ["repo", "view", ctx.project.github.repository, "--json", "nameWithOwner"]));
  if (repo.nameWithOwner.toLowerCase() !== ctx.project.github.repository.toLowerCase()) {
    throw new Error("GitHub repository mismatch");
  }
  return identity;
}

function currentBranch() {
  return capture("git", ["branch", "--show-current"]);
}

function assertBranch(ctx) {
  const branch = currentBranch();
  if (branch !== ctx.environment.branch) {
    throw new Error(`${ctx.stage} operations must run from branch ${ctx.environment.branch}; current branch is ${branch || "detached HEAD"}`);
  }
}

function hostedZone(ctx) {
  const domain = ctx.environment.domain;
  if (!domain?.name) return null;
  if (!domain.hostedZoneName) throw new Error(`domain.hostedZoneName is required for ${ctx.stage}`);
  const result = JSON.parse(capture("aws", [
    "route53", "list-hosted-zones-by-name", "--dns-name", domain.hostedZoneName,
    "--max-items", "1", "--output", "json",
  ]));
  const zone = result.HostedZones?.[0];
  if (!zone || zone.Name.replace(/\.$/, "") !== domain.hostedZoneName) {
    throw new Error(`Hosted zone ${domain.hostedZoneName} not found in ${ctx.stage} account`);
  }
  return zone.Id.replace("/hostedzone/", "");
}

function check() {
  const ctx = context();
  const identity = assertIdentities(ctx);
  const zoneId = hostedZone(ctx);
  let bootstrap = "missing";
  try {
    capture("aws", ["cloudformation", "describe-stacks", "--stack-name", "CDKToolkit", "--region", ctx.environment.aws.region]);
    bootstrap = "ready";
  } catch {}
  console.log(JSON.stringify({
    stage: ctx.stage,
    branch: currentBranch(),
    expectedBranch: ctx.environment.branch,
    awsAccount: identity.Account,
    region: ctx.environment.aws.region,
    repository: ctx.project.github.repository,
    hostedZoneId: zoneId,
    cdkBootstrap: bootstrap,
  }, null, 2));
}

function oidcProviderArn(ctx) {
  const arn = `arn:aws:iam::${ctx.environment.aws.accountId}:oidc-provider/token.actions.githubusercontent.com`;
  const providers = JSON.parse(capture("aws", ["iam", "list-open-id-connect-providers", "--output", "json"]));
  return providers.OpenIDConnectProviderList?.some((provider) => provider.Arn === arn) ? arn : null;
}

function bootstrap() {
  requireConfirmation("Bootstrap");
  const ctx = context();
  assertIdentities(ctx);
  assertBranch(ctx);
  const { accountId, region } = ctx.environment.aws;
  run("npx", ["cdk", "bootstrap", `aws://${accountId}/${region}`], { cwd: `${ROOT}infra` });

  const providerArn = oidcProviderArn(ctx) ?? capture("aws", [
    "iam", "create-open-id-connect-provider", "--url", "https://token.actions.githubusercontent.com",
    "--client-id-list", "sts.amazonaws.com", "--thumbprint-list", "6938fd4d98bab03faadb97b34396831e3780aea1",
    "--query", "OpenIDConnectProviderArn", "--output", "text",
  ]);
  const name = roleName(ctx.stage);
  const trust = JSON.stringify({ Version: "2012-10-17", Statement: [{
    Effect: "Allow", Principal: { Federated: providerArn }, Action: "sts:AssumeRoleWithWebIdentity",
    Condition: {
      StringEquals: {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": `repo:${ctx.project.github.repository}:environment:${ctx.stage}`,
      },
    },
  }] });
  try {
    run("aws", ["iam", "create-role", "--role-name", name, "--assume-role-policy-document", trust]);
  } catch {
    run("aws", ["iam", "update-assume-role-policy", "--role-name", name, "--policy-document", trust]);
  }
  const policy = JSON.stringify({ Version: "2012-10-17", Statement: [
    { Effect: "Allow", Action: ["sts:AssumeRole"], Resource: `arn:aws:iam::${accountId}:role/cdk-*` },
    { Effect: "Allow", Action: ["cloudformation:DescribeStacks", "cloudformation:ListStackResources", "cloudfront:CreateInvalidation"], Resource: "*" },
    { Effect: "Allow", Action: ["dynamodb:Query", "dynamodb:Scan", "dynamodb:DescribeTable"], Resource: [`arn:aws:dynamodb:${region}:${accountId}:table/*`, `arn:aws:dynamodb:${region}:${accountId}:table/*/index/*`] },
    { Effect: "Allow", Action: ["s3:ListBucket", "s3:GetBucketLocation"], Resource: "arn:aws:s3:::blog*" },
    { Effect: "Allow", Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource: "arn:aws:s3:::blog*/*" },
  ] });
  run("aws", ["iam", "put-role-policy", "--role-name", name, "--policy-name", "CdkBootstrapAccess", "--policy-document", policy]);
  console.log(`Bootstrap ${ctx.stage} ready. GitHub role: arn:aws:iam::${accountId}:role/${name}`);
}

function setVariable(repo, environment, name, value) {
  if (value !== undefined && value !== null && String(value) !== "") {
    run("gh", ["variable", "set", name, "--repo", repo, "--env", environment, "--body", String(value)]);
  } else {
    try {
      run("gh", ["variable", "delete", name, "--repo", repo, "--env", environment]);
    } catch {}
  }
}

function configureGitHub() {
  requireConfirmation("GitHub environment configuration");
  const ctx = context();
  assertIdentities(ctx);
  assertBranch(ctx);
  const repo = ctx.project.github.repository;
  const zoneId = hostedZone(ctx);
  run("gh", [
    "api", "--method", "PUT", `repos/${repo}/environments/${ctx.stage}`,
    "-F", "deployment_branch_policy[protected_branches]=false",
    "-F", "deployment_branch_policy[custom_branch_policies]=true",
  ]);
  const branchPolicies = JSON.parse(capture("gh", [
    "api", `repos/${repo}/environments/${ctx.stage}/deployment-branch-policies`,
  ]));
  if (!branchPolicies.branch_policies?.some((policy) => policy.name === ctx.environment.branch)) {
    run("gh", [
      "api", "--method", "POST", `repos/${repo}/environments/${ctx.stage}/deployment-branch-policies`,
      "-f", `name=${ctx.environment.branch}`, "-f", "type=branch",
    ]);
  }
  const prefix = repo.split("/")[1].toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const values = {
    DEPLOY_STAGE: ctx.stage,
    DEPLOY_BRANCH: ctx.environment.branch,
    AWS_ACCOUNT_ID: ctx.environment.aws.accountId,
    AWS_REGION: ctx.environment.aws.region,
    AWS_DEPLOY_ROLE_ARN: `arn:aws:iam::${ctx.environment.aws.accountId}:role/${roleName(ctx.stage)}`,
    COGNITO_DOMAIN_PREFIX: `${prefix}-${ctx.stage}-admin`,
    DOMAIN_NAME: ctx.environment.domain?.name,
    HOSTED_ZONE_ID: zoneId,
    HOSTED_ZONE_NAME: ctx.environment.domain?.hostedZoneName,
    ALARM_EMAIL: ctx.environment.operations?.alarmEmail,
    MONTHLY_BUDGET_USD: ctx.environment.operations?.monthlyBudgetUsd,
  };
  for (const [name, value] of Object.entries(values)) setVariable(repo, ctx.stage, name, value);
  run("gh", [
    "variable", "set", ctx.stage === "homolog" ? "HOMOLOG_CONFIGURED" : "PRODUCTION_CONFIGURED",
    "--repo", repo, "--body", "true",
  ]);
  console.log(`GitHub Environment ${ctx.stage} configured.`);
}

function stackOutputs(ctx, suffix) {
  const result = JSON.parse(capture("aws", [
    "cloudformation", "describe-stacks", "--stack-name", `${stackPrefix(ctx.stage)}${suffix}Stack`,
    "--region", ctx.environment.aws.region, "--output", "json",
  ]));
  return Object.fromEntries((result.Stacks?.[0]?.Outputs ?? []).map(({ OutputKey, OutputValue }) => [OutputKey, OutputValue]));
}

function syncOutputs() {
  requireConfirmation("GitHub output synchronization");
  const ctx = context();
  assertIdentities(ctx);
  assertBranch(ctx);
  const data = stackOutputs(ctx, "Data");
  const auth = stackOutputs(ctx, "Auth");
  const cdn = stackOutputs(ctx, "Cdn");
  const siteUrl = ctx.environment.domain?.name ? `https://${ctx.environment.domain.name}` : `https://${cdn.DistributionDomainName}`;
  const values = {
    BLOG_TABLE_NAME: data.TableName,
    WEB_BUCKET_NAME: cdn.WebBucketName,
    CLOUDFRONT_DISTRIBUTION_ID: cdn.DistributionId,
    SITE_URL: siteUrl,
    PUBLIC_API_BASE_URL: `${siteUrl}/api`,
    COGNITO_DOMAIN: auth.CognitoDomain,
    COGNITO_CLIENT_ID: auth.UserPoolClientId,
    COGNITO_REDIRECT_URI: `${siteUrl}/admin/callback`,
    COGNITO_LOGOUT_REDIRECT_URI: `${siteUrl}/admin/login`,
  };
  for (const [name, value] of Object.entries(values)) setVariable(ctx.project.github.repository, ctx.stage, name, value);
  console.log(`CloudFormation outputs synchronized to GitHub Environment ${ctx.stage}.`);
}

function dispatch(workflow, inputs = {}) {
  requireConfirmation(`Workflow ${workflow}`);
  const ctx = context();
  assertIdentities(ctx);
  assertBranch(ctx);
  const args = ["workflow", "run", workflow, "--repo", ctx.project.github.repository, "--ref", ctx.environment.branch, "-f", `stage=${ctx.stage}`];
  for (const [name, value] of Object.entries(inputs)) args.push("-f", `${name}=${value}`);
  run("gh", args);
  console.log(`Workflow ${workflow} dispatched for ${ctx.stage}. Follow it with gh run watch --repo ${ctx.project.github.repository}`);
}

async function dispatchAndWatch(workflow) {
  dispatch(workflow);
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const ctx = context();
  const runs = JSON.parse(capture("gh", ["run", "list", "--repo", ctx.project.github.repository, "--workflow", workflow, "--branch", ctx.environment.branch, "--limit", "1", "--json", "databaseId"]));
  if (!runs[0]?.databaseId) throw new Error(`Could not find the run for ${workflow}`);
  run("gh", ["run", "watch", String(runs[0].databaseId), "--repo", ctx.project.github.repository, "--exit-status"]);
}

function setupAdmin() {
  requireConfirmation("Admin setup");
  const ctx = context();
  assertIdentities(ctx);
  assertBranch(ctx);
  if (!ctx.environment.admin?.email) throw new Error(`admin.email is required for ${ctx.stage}`);
  const auth = stackOutputs(ctx, "Auth");
  const api = stackOutputs(ctx, "Api");
  const token = capture("gh", ["auth", "token"]);
  run("aws", ["secretsmanager", "put-secret-value", "--secret-id", api.GitHubTokenSecretArn, "--secret-string", token, "--region", ctx.environment.aws.region]);
  try {
    run("aws", ["cognito-idp", "admin-get-user", "--user-pool-id", auth.UserPoolId, "--username", ctx.environment.admin.email, "--region", ctx.environment.aws.region]);
  } catch {
    run("aws", ["cognito-idp", "admin-create-user", "--user-pool-id", auth.UserPoolId, "--username", ctx.environment.admin.email, "--user-attributes", `Name=email,Value=${ctx.environment.admin.email}`, "Name=email_verified,Value=true", "--region", ctx.environment.aws.region]);
  }
  console.log(`GitHub dispatch secret and Cognito admin configured for ${ctx.stage}.`);
}

async function verify() {
  const ctx = context();
  assertIdentities(ctx);
  const cdn = stackOutputs(ctx, "Cdn");
  const base = ctx.environment.domain?.name ? `https://${ctx.environment.domain.name}` : `https://${cdn.DistributionDomainName}`;
  const checks = [["/", 200], ["/sobre/", 200], ["/sitemap-index.xml", 200], ["/rss.xml", 200], ["/__missing__", 404], ["/admin/login", 200]];
  for (const [path, expected] of checks) {
    const response = await fetch(`${base}${path}`, { redirect: "manual" });
    if (response.status !== expected) throw new Error(`${path}: expected ${expected}, received ${response.status}`);
    console.log(`OK ${response.status} ${path}`);
  }
}

function destroyHomolog() {
  requireConfirmation("Complete homologation destruction");
  const ctx = context();
  if (ctx.stage !== "homolog") throw new Error("Destruction is permanently disabled for production");
  assertIdentities(ctx);
  assertBranch(ctx);
  if (option("confirm") !== "DESTROY-HOMOLOG") {
    throw new Error("Pass --confirm DESTROY-HOMOLOG after reviewing the dedicated teardown guide");
  }
  dispatch("destroy-homolog.yml", { confirmation: "DESTROY-HOMOLOG" });
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
  check,
  bootstrap,
  "github:configure": configureGitHub,
  "github:sync-outputs": syncOutputs,
  "deploy:infra": () => dispatch("deploy-infra.yml"),
  "deploy:site": () => dispatch("deploy-site.yml"),
  "admin:setup": setupAdmin,
  "destroy:homolog": destroyHomolog,
  verify,
  launch,
};

try {
  if (!commands[command]) {
    console.log("Usage: project-ops.mjs <command> --stage <homolog|production> [--yes] [--confirm DESTROY-HOMOLOG]");
    process.exit(command === "help" ? 0 : 1);
  }
  await commands[command]();
} catch (error) {
  console.error(`[project-ops] ${error.message}`);
  process.exit(1);
}
