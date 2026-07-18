import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { join } from "node:path";

export interface ApiStackProps extends StackProps {
  table: dynamodb.Table;
  /**
   * Just the name, not the Bucket construct: the bucket itself is created in
   * CdnStack (see cdn-stack.ts for why), which needs this stack's httpApi
   * and therefore must be instantiated *after* it — so this stack can't
   * hold a reference to the real construct yet. An IAM policy scoped to the
   * ARN built from this name is just as tight as `bucket.grantPut()`.
   */
  imagesBucketName: string;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  adminAuthorizationScope: string;
  /** "owner/repo" — where the GitHub Actions rebuild workflow lives. */
  githubRepo: string;
  /** GitHub Environment that must rebuild after a content change. */
  deployStage: "homolog" | "production";
  /** e.g. https://blog.com/images — where uploaded cover images are publicly served from. */
  publicImagesBaseUrl: string;
  alarmEmail?: string;
}

const LAMBDAS_DIR = join(__dirname, "..", "..", "lambdas");

export class ApiStack extends Stack {
  public readonly httpApi: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // Placeholder secret — fill the real value after deploy with:
    //   aws secretsmanager put-secret-value --secret-id <arn> --secret-string <a GitHub PAT with repo scope>
    // A fine-grained PAT scoped to just this repo's "contents: write" / dispatches is enough.
    const githubTokenSecret = new secretsmanager.Secret(this, "GitHubTokenSecret", {
      description: "GitHub PAT used to fire repository_dispatch and trigger a site rebuild.",
    });

    const scheduleGroup = new scheduler.CfnScheduleGroup(this, "PublishScheduleGroup");
    const schedulerDeadLetterQueue = new sqs.Queue(this, "PublishSchedulerDeadLetterQueue", {
      retentionPeriod: Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    const commonBundling: lambdaNodejs.BundlingOptions = {
      minify: true,
      target: "node20",
    };
    const commonProps: Partial<lambdaNodejs.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_MONTH,
      bundling: commonBundling,
    };

    // --- posts: admin CRUD, least-privilege table access + scheduler + github secret ---
    const postsFn = new lambdaNodejs.NodejsFunction(this, "PostsFunction", {
      ...commonProps,
      entry: join(LAMBDAS_DIR, "posts", "src", "index.ts"),
      environment: {
        TABLE_NAME: props.table.tableName,
        SCHEDULER_GROUP_NAME: scheduleGroup.ref,
        GITHUB_TOKEN_SECRET_ARN: githubTokenSecret.secretArn,
        GITHUB_REPO: props.githubRepo,
        DEPLOY_STAGE: props.deployStage,
        PUBLIC_IMAGES_BASE_URL: props.publicImagesBaseUrl,
      },
    });
    props.table.grantReadWriteData(postsFn);
    githubTokenSecret.grantRead(postsFn);

    // --- views: public endpoint, UpdateItem only (PROJECT_SPEC.md section 13.2) ---
    const viewsFn = new lambdaNodejs.NodejsFunction(this, "ViewsFunction", {
      ...commonProps,
      entry: join(LAMBDAS_DIR, "views", "src", "index.ts"),
      environment: { TABLE_NAME: props.table.tableName },
    });
    viewsFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:UpdateItem"],
        resources: [props.table.tableArn],
      })
    );

    // --- uploads: presigned PUT only, no table access ---
    const uploadsFn = new lambdaNodejs.NodejsFunction(this, "UploadsFunction", {
      ...commonProps,
      entry: join(LAMBDAS_DIR, "uploads", "src", "index.ts"),
      environment: {
        IMAGES_BUCKET_NAME: props.imagesBucketName,
        PUBLIC_IMAGES_BASE_URL: props.publicImagesBaseUrl,
      },
    });
    uploadsFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [`arn:aws:s3:::${props.imagesBucketName}/*`],
      })
    );

    // --- metrics: read-only ---
    const metricsFn = new lambdaNodejs.NodejsFunction(this, "MetricsFunction", {
      ...commonProps,
      entry: join(LAMBDAS_DIR, "metrics", "src", "index.ts"),
      environment: { TABLE_NAME: props.table.tableName },
    });
    props.table.grantReadData(metricsFn);

    // --- publish-scheduler: invoked by EventBridge Scheduler, not by API Gateway ---
    const publishSchedulerFn = new lambdaNodejs.NodejsFunction(this, "PublishSchedulerFunction", {
      ...commonProps,
      entry: join(LAMBDAS_DIR, "publish-scheduler", "src", "index.ts"),
      environment: {
        TABLE_NAME: props.table.tableName,
        GITHUB_TOKEN_SECRET_ARN: githubTokenSecret.secretArn,
        GITHUB_REPO: props.githubRepo,
        DEPLOY_STAGE: props.deployStage,
      },
    });
    publishSchedulerFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:UpdateItem"],
        resources: [props.table.tableArn],
      })
    );
    githubTokenSecret.grantRead(publishSchedulerFn);

    // Role EventBridge Scheduler assumes to invoke the publish-scheduler Lambda.
    // postsFn needs iam:PassRole on this to create/update schedules (scheduler.ts).
    const schedulerInvocationRole = new iam.Role(this, "SchedulerInvocationRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
    });
    publishSchedulerFn.grantInvoke(schedulerInvocationRole);
    schedulerDeadLetterQueue.grantSendMessages(schedulerInvocationRole);
    postsFn.addEnvironment("SCHEDULER_ROLE_ARN", schedulerInvocationRole.roleArn);
    postsFn.addEnvironment("PUBLISH_SCHEDULER_FUNCTION_ARN", publishSchedulerFn.functionArn);
    postsFn.addEnvironment("SCHEDULER_DLQ_ARN", schedulerDeadLetterQueue.queueArn);
    postsFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["scheduler:CreateSchedule", "scheduler:UpdateSchedule", "scheduler:DeleteSchedule"],
        resources: [`arn:aws:scheduler:${this.region}:${this.account}:schedule/${scheduleGroup.ref}/*`],
      })
    );
    postsFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["iam:PassRole"],
        resources: [schedulerInvocationRole.roleArn],
      })
    );

    // --- HTTP API ---
    const authorizer = new HttpUserPoolAuthorizer("AdminAuthorizer", props.userPool, {
      userPoolClients: [props.userPoolClient],
    });

    this.httpApi = new apigwv2.HttpApi(this, "BlogHttpApi", {
      createDefaultStage: false,
    });
    const apiStage = new apigwv2.HttpStage(this, "DefaultStage", {
      httpApi: this.httpApi,
      stageName: "$default",
      autoDeploy: true,
      throttle: { rateLimit: 50, burstLimit: 100 },
    });
    const cfnStage = apiStage.node.defaultChild as apigwv2.CfnStage;
    cfnStage.routeSettings = {
      "POST /views/{slug}": {
        throttlingRateLimit: 2,
        throttlingBurstLimit: 10,
        detailedMetricsEnabled: true,
      },
    };

    const postsIntegration = new HttpLambdaIntegration("PostsIntegration", postsFn);
    const uploadsIntegration = new HttpLambdaIntegration("UploadsIntegration", uploadsFn);
    const metricsIntegration = new HttpLambdaIntegration("MetricsIntegration", metricsFn);
    const viewsIntegration = new HttpLambdaIntegration("ViewsIntegration", viewsFn);

    const authorized = {
      authorizer,
      authorizationScopes: [props.adminAuthorizationScope],
    };

    this.httpApi.addRoutes({ path: "/posts", methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST], integration: postsIntegration, ...authorized });
    this.httpApi.addRoutes({ path: "/posts/{slug}", methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.DELETE], integration: postsIntegration, ...authorized });
    this.httpApi.addRoutes({ path: "/uploads/presign", methods: [apigwv2.HttpMethod.POST], integration: uploadsIntegration, ...authorized });
    this.httpApi.addRoutes({ path: "/metrics", methods: [apigwv2.HttpMethod.GET], integration: metricsIntegration, ...authorized });
    // Public — no authorizer (see lambdas/views/src/index.ts).
    this.httpApi.addRoutes({ path: "/views/{slug}", methods: [apigwv2.HttpMethod.POST], integration: viewsIntegration });

    if (props.alarmEmail) {
      const alarmTopic = new sns.Topic(this, "OperationalAlarmTopic");
      alarmTopic.addSubscription(new subscriptions.EmailSubscription(props.alarmEmail));
      const alarmAction = new actions.SnsAction(alarmTopic);
      for (const fn of [postsFn, viewsFn, uploadsFn, metricsFn, publishSchedulerFn]) {
        new cloudwatch.Alarm(this, `${fn.node.id}ErrorAlarm`, {
          metric: fn.metricErrors({ period: Duration.minutes(5) }),
          threshold: 1,
          evaluationPeriods: 1,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        }).addAlarmAction(alarmAction);
      }
      new cloudwatch.Alarm(this, "SchedulerDlqAlarm", {
        metric: schedulerDeadLetterQueue.metricApproximateNumberOfMessagesVisible(),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(alarmAction);
      new cloudwatch.Alarm(this, "ApiServerErrorAlarm", {
        metric: apiStage.metricServerError({ period: Duration.minutes(5) }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(alarmAction);
      new CfnOutput(this, "AlarmTopicArn", { value: alarmTopic.topicArn });
    }

    new CfnOutput(this, "ApiEndpoint", { value: this.httpApi.apiEndpoint });
    new CfnOutput(this, "GitHubTokenSecretArn", { value: githubTokenSecret.secretArn });
  }
}
